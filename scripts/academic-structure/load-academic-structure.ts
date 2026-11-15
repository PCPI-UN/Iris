/**
 * Loads departments, course sections (NRC per term) and the course section of each
 * project into project-service (CU-86e3vmz0m). It decides what Professors and
 * Department Directors can read, until an administration screen exists.
 *
 * Usage (bash or PowerShell, from the repo root):
 *   AUTH_DATABASE_URL=...  PROJECT_DATABASE_URL=...  (PowerShell: $env:AUTH_DATABASE_URL="...")
 *   pnpm exec ts-node scripts/academic-structure/load-academic-structure.ts <file.json> [--dry-run]
 *
 * - The file format is in example.json. Users are given by email and looked up in
 *   auth-service (read only); everything is written to project-service.
 * - Everything is checked first: with any error nothing is written. Then it writes in
 *   one transaction. Running the same file again changes nothing.
 * - Departments are matched by name and course sections by (term, nrc): existing ones
 *   are updated with the values of the file. Nothing is deleted.
 * - --dry-run prints what would be written and writes nothing.
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import {
  AcademicStructureFile,
  buildPlan,
  courseKey,
  emailsOf,
  KnownUser,
  Plan,
} from './academic-structure.plan';

function connect(variable: string): PrismaClient {
  const url = process.env[variable];
  if (!url) throw new Error(`Set ${variable} to the connection URL of the database`);
  return new PrismaClient({ datasourceUrl: url });
}

async function lookUsers(auth: PrismaClient, emails: string[]) {
  if (!emails.length) return new Map<string, KnownUser>();
  const rows = await auth.$queryRaw<KnownUser[]>`
    SELECT u.id, lower(u.email) AS email,
           coalesce(array_agg(r.name) FILTER (WHERE ps.active), '{}') AS roles
    FROM users u
    LEFT JOIN platform_staff ps ON ps.user_id = u.id
    LEFT JOIN roles r ON r.id = ps.role_id
    WHERE lower(u.email) = ANY(${emails}) AND u.active
    GROUP BY u.id`;
  return new Map(rows.map((row) => [row.email, row]));
}

async function readLookups(project: PrismaClient, file: AcademicStructureFile) {
  const ids = (file.projects ?? []).map((p) => Number(p.projectId)).filter(Number.isInteger);
  const [projects, departments, courses] = await Promise.all([
    ids.length
      ? project.$queryRaw<{ id: number }[]>`SELECT id FROM projects WHERE id = ANY(${ids})`
      : Promise.resolve([]),
    project.$queryRaw<{ name: string; director_user_id: number | null }[]>`
      SELECT name, director_user_id FROM departments`,
    project.$queryRaw<{ term: string; nrc: string }[]>`SELECT term, nrc FROM academic_courses`,
  ]);
  return {
    projectIds: new Set(projects.map((p) => p.id)),
    existingDirectors: new Map(departments.map((d) => [d.name, d.director_user_id])),
    existingCourses: new Set(courses.map((c) => courseKey(c.term, c.nrc))),
  };
}

async function write(project: PrismaClient, plan: Plan) {
  await project.$transaction(async (tx) => {
    // Free the directors of the departments in the file first, so a director can move
    // from one of them to another without breaking "one department per director"
    const names = plan.departments.map((d) => d.name);
    if (names.length) {
      await tx.$executeRaw`UPDATE departments SET director_user_id = NULL WHERE name = ANY(${names})`;
    }
    for (const d of plan.departments) {
      await tx.$executeRaw`
        INSERT INTO departments (name, director_user_id, updated_at)
        VALUES (${d.name}, ${d.directorUserId}, now())
        ON CONFLICT (name) DO UPDATE
          SET director_user_id = EXCLUDED.director_user_id, updated_at = now()`;
    }
    for (const c of plan.courses) {
      await tx.$executeRaw`
        INSERT INTO academic_courses (nrc, term, name, professor_user_id, department_id, updated_at)
        SELECT ${c.nrc}, ${c.term}, ${c.name}, ${c.professorUserId}, d.id, now()
        FROM departments d WHERE d.name = ${c.department}
        ON CONFLICT (term, nrc) DO UPDATE
          SET name = EXCLUDED.name, professor_user_id = EXCLUDED.professor_user_id,
              department_id = EXCLUDED.department_id, updated_at = now()`;
    }
    for (const p of plan.projects) {
      await tx.$executeRaw`
        UPDATE projects
        SET academic_course_id = (SELECT id FROM academic_courses WHERE term = ${p.term} AND nrc = ${p.nrc}),
            updated_at = now()
        WHERE id = ${p.projectId}`;
    }
  });
}

async function main() {
  const [path, ...flags] = process.argv.slice(2);
  if (!path) throw new Error('Usage: load-academic-structure.ts <file.json> [--dry-run]');
  const dryRun = flags.includes('--dry-run');
  const file = JSON.parse(readFileSync(path, 'utf8')) as AcademicStructureFile;

  const auth = connect('AUTH_DATABASE_URL');
  const project = connect('PROJECT_DATABASE_URL');
  try {
    const [users, lookups] = await Promise.all([lookUsers(auth, emailsOf(file)), readLookups(project, file)]);
    const plan = buildPlan(file, { users, ...lookups });

    plan.warnings.forEach((warning) => console.warn(`WARNING ${warning}`));
    if (plan.errors.length) {
      plan.errors.forEach((error) => console.error(`ERROR ${error}`));
      console.error(`\n${plan.errors.length} error(s): nothing was written.`);
      process.exitCode = 1;
      return;
    }

    const summary = `${plan.departments.length} department(s), ${plan.courses.length} course section(s), ${plan.projects.length} project link(s)`;
    if (dryRun) {
      console.log(JSON.stringify(plan, null, 2));
      console.log(`\nDry run: would write ${summary}. Nothing was written.`);
      return;
    }
    await write(project, plan);
    console.log(`Written: ${summary}.`);
  } finally {
    await Promise.all([auth.$disconnect(), project.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
