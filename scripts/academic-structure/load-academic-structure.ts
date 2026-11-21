/**
 * Loads departments, course sections (NRC per term) and the course section of each
 * project into project-service (CU-86e3vmz0m). It decides what Professors and
 * Department Directors can read, until an administration screen exists.
 *
 * Usage (bash or PowerShell, from the repo root):
 *   AUTH_DATABASE_URL=...  EVENT_DATABASE_URL=...  PROJECT_DATABASE_URL=...
 *   (PowerShell: $env:AUTH_DATABASE_URL="...")
 *   pnpm exec ts-node scripts/academic-structure/load-academic-structure.ts <file.json> [--dry-run]
 *
 * - The file format is in example.json. Users are given by email and looked up in
 *   auth-service; terms (year + period) and the term of each project's event are looked up
 *   in event-service. Both are read only; everything is written to project-service.
 * - A term must exist before it is used (POST /terms). A project is linked only to a
 *   course section of the term of its event, as a student submission would be.
 * - The fill rows (department -1 "Sin departamento", course sections -1 "Sin NRC" and
 *   0 "No aplica") cannot be named or changed from the file. A project of an event that does
 *   not require a course section keeps course section 0.
 * - Everything is checked first: with any error nothing is written. Then it writes in
 *   one transaction. Running the same file again changes nothing.
 * - Departments are matched by name and course sections by (term, nrc): existing ones
 *   are updated with the values of the file. Nothing is deleted.
 * - A department without directorEmail keeps the director it has; "directorEmail": null
 *   leaves it without director.
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
  NO_DEPARTMENT_NAME,
  Plan,
  termKey,
} from './academic-structure.plan';

/** Row -1 of terms, departments and academic_courses: the data that existed before them */
const FILL_ROW_ID = -1;
/** academic_courses also has row 0 ("No aplica"); the real rows start at 1 */
const FIRST_REAL_ID = 1;

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

async function readLookups(project: PrismaClient, event: PrismaClient, file: AcademicStructureFile) {
  const ids = (file.projects ?? []).map((p) => Number(p.projectId)).filter(Number.isInteger);
  const [projects, departments, courses, terms] = await Promise.all([
    ids.length
      ? project.$queryRaw<{ id: number; event_id: number }[]>`
          SELECT id, event_id FROM projects WHERE id = ANY(${ids})`
      : Promise.resolve([]),
    project.$queryRaw<{ name: string; director_user_id: number | null }[]>`
      SELECT name, director_user_id FROM departments WHERE id <> ${FILL_ROW_ID}`,
    project.$queryRaw<{ term_id: number; nrc: string }[]>`
      SELECT term_id, nrc FROM academic_courses WHERE id >= ${FIRST_REAL_ID}`,
    event.$queryRaw<{ id: number; year: number; period: string }[]>`
      SELECT id, year, period FROM terms WHERE id <> ${FILL_ROW_ID}`,
  ]);
  const eventIds = [...new Set(projects.map((p) => p.event_id))];
  const events = eventIds.length
    ? await event.$queryRaw<{ id: number; term_id: number; requires_course: boolean }[]>`
        SELECT id, term_id, requires_course FROM event WHERE id = ANY(${eventIds})`
    : [];
  return {
    terms: new Map(terms.map((t) => [termKey(t.year, t.period), t.id])),
    projectEvents: new Map(projects.map((p) => [p.id, p.event_id])),
    eventTerms: new Map(events.map((e) => [e.id, e.term_id])),
    eventRequiresCourse: new Map(events.map((e) => [e.id, e.requires_course])),
    existingDirectors: new Map(departments.map((d) => [d.name, d.director_user_id])),
    existingCourses: new Set(courses.map((c) => courseKey(c.term_id, c.nrc))),
  };
}

async function write(project: PrismaClient, plan: Plan) {
  await project.$transaction(async (tx) => {
    // Free the directors of the departments in the file first, so a director can move
    // from one of them to another without breaking "one department per director"
    const names = plan.departments.map((d) => d.name);
    if (names.length) {
      await tx.$executeRaw`
        UPDATE departments SET director_user_id = NULL
        WHERE name = ANY(${names}) AND name <> ${NO_DEPARTMENT_NAME}`;
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
        INSERT INTO academic_courses (nrc, term_id, name, professor_user_id, department_id, updated_at)
        SELECT ${c.nrc}, ${c.termId}, ${c.name}, ${c.professorUserId}, d.id, now()
        FROM departments d WHERE d.name = ${c.department} AND d.id >= ${FIRST_REAL_ID}
        ON CONFLICT (term_id, nrc) DO UPDATE
          SET name = EXCLUDED.name, professor_user_id = EXCLUDED.professor_user_id,
              department_id = EXCLUDED.department_id, updated_at = now()`;
    }
    for (const p of plan.projects) {
      await tx.$executeRaw`
        UPDATE projects
        SET academic_course_id = (SELECT id FROM academic_courses WHERE term_id = ${p.termId} AND nrc = ${p.nrc}),
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
  const event = connect('EVENT_DATABASE_URL');
  const project = connect('PROJECT_DATABASE_URL');
  try {
    const [users, lookups] = await Promise.all([lookUsers(auth, emailsOf(file)), readLookups(project, event, file)]);
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
    await Promise.all([auth.$disconnect(), event.$disconnect(), project.$disconnect()]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
