/**
 * Validation of the academic structure file (CU-86e3vmz0m), with no database access, so
 * it can be tested on its own. load-academic-structure.ts reads the databases, calls
 * buildPlan and writes the plan.
 */

export interface AcademicStructureFile {
  departments?: { name: string; directorEmail?: string | null }[];
  courses?: {
    term: string;
    nrc: string;
    name: string;
    professorEmail: string;
    department: string;
  }[];
  projects?: { projectId: number; term: string; nrc: string }[];
}

/** Platform users found by email in auth-service, with their active role names */
export interface KnownUser {
  id: number;
  email: string;
  roles: string[];
}

export interface Lookups {
  /** Users by lower-cased email */
  users: Map<string, KnownUser>;
  /** Ids of the projects that exist */
  projectIds: Set<number>;
  /** Departments already in the database: name -> director user id */
  existingDirectors: Map<string, number | null>;
  /** Course sections already in the database, as courseKey(term, nrc) */
  existingCourses: Set<string>;
}

export interface Plan {
  departments: { name: string; directorUserId: number | null }[];
  courses: {
    term: string;
    nrc: string;
    name: string;
    professorUserId: number;
    department: string;
  }[];
  projects: { projectId: number; term: string; nrc: string }[];
  errors: string[];
  warnings: string[];
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const normalizeEmail = (value: unknown): string =>
  text(value).toLowerCase();

export const courseKey = (term: string, nrc: string) => `${term}/${nrc}`;

/** Every email the file mentions, to look them up in one query */
export function emailsOf(file: AcademicStructureFile): string[] {
  const emails = [
    ...(file.departments ?? []).map((d) => normalizeEmail(d.directorEmail)),
    ...(file.courses ?? []).map((c) => normalizeEmail(c.professorEmail)),
  ];
  return [...new Set(emails.filter(Boolean))];
}

/**
 * Checks the file against the lookups and returns what to write. Any error means
 * nothing is written; warnings are only printed.
 */
export function buildPlan(file: AcademicStructureFile, lookups: Lookups): Plan {
  const errors: string[] = [];
  const warnings: string[] = [];

  const userFor = (email: string, role: string, where: string) => {
    const user = lookups.users.get(email);
    if (!user) {
      errors.push(`${where}: no user with email ${email}`);
      return null;
    }
    if (!user.roles.includes(role)) {
      warnings.push(
        `${where}: ${email} does not hold the ${role} role, so they will not see these projects until it is granted`,
      );
    }
    return user;
  };

  // Departments
  const departments: Plan['departments'] = [];
  const seenDepartments = new Set<string>();
  for (const [index, department] of (file.departments ?? []).entries()) {
    const where = `departments[${index}]`;
    const name = text(department.name);
    if (!name) {
      errors.push(`${where}: name is required`);
      continue;
    }
    if (seenDepartments.has(name)) {
      errors.push(`${where}: department "${name}" is repeated`);
      continue;
    }
    seenDepartments.add(name);

    const email = normalizeEmail(department.directorEmail);
    const director = email ? userFor(email, 'DepartmentDirector', where) : null;
    departments.push({ name, directorUserId: director?.id ?? null });
  }

  // A user directs at most one department, counting the ones not in the file
  const directorOf = new Map<number, string>();
  for (const [name, directorId] of lookups.existingDirectors) {
    if (directorId !== null && !seenDepartments.has(name)) directorOf.set(directorId, name);
  }
  for (const { name, directorUserId } of departments) {
    if (directorUserId === null) continue;
    const other = directorOf.get(directorUserId);
    if (other !== undefined) {
      errors.push(`Department "${name}": its director already directs "${other}"; a user directs one department`);
    } else {
      directorOf.set(directorUserId, name);
    }
  }

  // Course sections
  const knownDepartments = new Set([...lookups.existingDirectors.keys(), ...seenDepartments]);
  const courses: Plan['courses'] = [];
  const seenCourses = new Set<string>();
  for (const [index, course] of (file.courses ?? []).entries()) {
    const where = `courses[${index}]`;
    const term = text(course.term);
    const nrc = text(course.nrc);
    const name = text(course.name);
    const department = text(course.department);
    const email = normalizeEmail(course.professorEmail);
    const missing = [
      ['term', term],
      ['nrc', nrc],
      ['name', name],
      ['department', department],
      ['professorEmail', email],
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);
    if (missing.length) {
      errors.push(`${where}: ${missing.join(', ')} required`);
      continue;
    }
    const key = courseKey(term, nrc);
    if (seenCourses.has(key)) {
      errors.push(`${where}: NRC ${nrc} of term ${term} is repeated`);
      continue;
    }
    seenCourses.add(key);
    if (!knownDepartments.has(department)) {
      errors.push(`${where}: department "${department}" is neither in the file nor in the database`);
    }
    const professor = userFor(email, 'Professor', where);
    if (professor) {
      courses.push({ term, nrc, name, professorUserId: professor.id, department });
    }
  }

  // Projects linked to a course section of the file or of the database
  const projects: Plan['projects'] = [];
  const seenProjects = new Set<number>();
  for (const [index, link] of (file.projects ?? []).entries()) {
    const where = `projects[${index}]`;
    const projectId = Number(link.projectId);
    const term = text(link.term);
    const nrc = text(link.nrc);
    if (!Number.isInteger(projectId) || projectId <= 0 || !term || !nrc) {
      errors.push(`${where}: projectId, term and nrc are required`);
      continue;
    }
    if (seenProjects.has(projectId)) {
      errors.push(`${where}: project ${projectId} is repeated`);
      continue;
    }
    seenProjects.add(projectId);
    if (!lookups.projectIds.has(projectId)) {
      errors.push(`${where}: project ${projectId} does not exist`);
      continue;
    }
    if (!seenCourses.has(courseKey(term, nrc)) && !lookups.existingCourses.has(courseKey(term, nrc))) {
      errors.push(`${where}: NRC ${nrc} of term ${term} is neither in the file nor in the database`);
      continue;
    }
    projects.push({ projectId, term, nrc });
  }

  return { departments, courses, projects, errors, warnings };
}
