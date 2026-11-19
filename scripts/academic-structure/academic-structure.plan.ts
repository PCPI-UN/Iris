/**
 * Validation of the academic structure file (CU-86e3vmz0m), with no database access, so
 * it can be tested on its own. load-academic-structure.ts reads the databases, calls
 * buildPlan and writes the plan.
 */

export interface AcademicStructureFile {
  /**
   * directorEmail omitted: the department keeps the director it has (none if it is new);
   * null: the department is left without director; an email: that user directs it
   */
  departments?: { name: string; directorEmail?: string | null }[];
  /** year + period is the term: 2026 + "10" is 202610 (event-service terms) */
  courses?: {
    year: number;
    period: string;
    nrc: string;
    name: string;
    professorEmail: string;
    department: string;
  }[];
  projects?: { projectId: number; year: number; period: string; nrc: string }[];
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
  /** event-service terms as termKey(year, period) -> term id, without the "no term" row -1 */
  terms: Map<string, number>;
  /** Projects of the file that exist: project id -> event id */
  projectEvents: Map<number, number>;
  /** Events of those projects: event id -> term id (-1 when the event has no term yet) */
  eventTerms: Map<number, number>;
  /** Events of those projects: event id -> whether its projects need a course section */
  eventRequiresCourse: Map<number, boolean>;
  /** Departments already in the database, without department -1: name -> director user id */
  existingDirectors: Map<string, number | null>;
  /** Course sections already in the database, without the fill rows -1 and 0, as courseKey(termId, nrc) */
  existingCourses: Set<string>;
}

export interface Plan {
  departments: { name: string; directorUserId: number | null }[];
  courses: {
    termId: number;
    nrc: string;
    name: string;
    professorUserId: number;
    department: string;
  }[];
  projects: { projectId: number; termId: number; nrc: string }[];
  errors: string[];
  warnings: string[];
}

/** Name of department -1, which holds the projects created before course sections existed */
export const NO_DEPARTMENT_NAME = 'Sin departamento';

const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const normalizeEmail = (value: unknown): string =>
  text(value).toLowerCase();

export const termKey = (year: number, period: string) => `${year}/${period}`;

export const courseKey = (termId: number, nrc: string) => `${termId}/${nrc}`;

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

  /** Term id of (year, period); undefined (and an error) when event-service does not have it */
  const termFor = (year: number, period: string, where: string) => {
    const termId = lookups.terms.get(termKey(year, period));
    if (termId === undefined) {
      errors.push(`${where}: term ${year}${period} does not exist; create it first (POST /terms)`);
    }
    return termId;
  };

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
    if (name === NO_DEPARTMENT_NAME) {
      errors.push(`${where}: "${name}" is reserved for the projects created before course sections existed`);
      continue;
    }
    if (seenDepartments.has(name)) {
      errors.push(`${where}: department "${name}" is repeated`);
      continue;
    }
    seenDepartments.add(name);

    // Omitting directorEmail must not remove the director: a later file may list the
    // department only to add course sections to it
    let directorUserId: number | null;
    if (department.directorEmail === undefined) {
      directorUserId = lookups.existingDirectors.get(name) ?? null;
    } else if (department.directorEmail === null) {
      directorUserId = null;
    } else {
      const email = normalizeEmail(department.directorEmail);
      if (!email) {
        errors.push(`${where}: directorEmail must be an email, or null to leave the department without director`);
        continue;
      }
      directorUserId = userFor(email, 'DepartmentDirector', where)?.id ?? null;
    }
    departments.push({ name, directorUserId });
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
    const year = Number(course.year);
    const period = text(course.period);
    const nrc = text(course.nrc);
    const name = text(course.name);
    const department = text(course.department);
    const email = normalizeEmail(course.professorEmail);
    const missing = [
      ['year', Number.isInteger(year) ? 'ok' : ''],
      ['period', period],
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
    const termId = termFor(year, period, where);
    if (termId === undefined) continue;
    const key = courseKey(termId, nrc);
    if (seenCourses.has(key)) {
      errors.push(`${where}: NRC ${nrc} of term ${year}${period} is repeated`);
      continue;
    }
    seenCourses.add(key);
    if (!knownDepartments.has(department)) {
      errors.push(`${where}: department "${department}" is neither in the file nor in the database`);
    }
    const professor = userFor(email, 'Professor', where);
    if (professor) {
      courses.push({ termId, nrc, name, professorUserId: professor.id, department });
    }
  }

  // Projects linked to a course section of the file or of the database, in the term of
  // their event: the same rule a student submission follows
  const projects: Plan['projects'] = [];
  const seenProjects = new Set<number>();
  for (const [index, link] of (file.projects ?? []).entries()) {
    const where = `projects[${index}]`;
    const projectId = Number(link.projectId);
    const year = Number(link.year);
    const period = text(link.period);
    const nrc = text(link.nrc);
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(year) || !period || !nrc) {
      errors.push(`${where}: projectId, year, period and nrc are required`);
      continue;
    }
    if (seenProjects.has(projectId)) {
      errors.push(`${where}: project ${projectId} is repeated`);
      continue;
    }
    seenProjects.add(projectId);
    const eventId = lookups.projectEvents.get(projectId);
    if (eventId === undefined) {
      errors.push(`${where}: project ${projectId} does not exist`);
      continue;
    }
    if (lookups.eventRequiresCourse.get(eventId) === false) {
      errors.push(
        `${where}: event ${eventId} of project ${projectId} does not require a course section; its projects keep course section 0`,
      );
      continue;
    }
    const termId = termFor(year, period, where);
    if (termId === undefined) continue;
    if (!seenCourses.has(courseKey(termId, nrc)) && !lookups.existingCourses.has(courseKey(termId, nrc))) {
      errors.push(`${where}: NRC ${nrc} of term ${year}${period} is neither in the file nor in the database`);
      continue;
    }
    if (lookups.eventTerms.get(eventId) !== termId) {
      errors.push(
        `${where}: event ${eventId} of project ${projectId} is not in term ${year}${period}; set the term of the event first (PATCH /events/${eventId})`,
      );
      continue;
    }
    projects.push({ projectId, termId, nrc });
  }

  return { departments, courses, projects, errors, warnings };
}
