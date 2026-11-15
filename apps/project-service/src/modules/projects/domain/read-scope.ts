import { PROFESSOR_ROLE_ID, TUTOR_ROLE_ID } from './entities/project.entity';

/** Platform role ids, fixed by the auth-service migrations. */
export const ADMIN_ROLE_ID = 1;
export const FACULTY_ADMIN_ROLE_ID = 6;
export const DEAN_ROLE_ID = 7;
export const DEPARTMENT_DIRECTOR_ROLE_ID = 8;

/** Roles that read every project. */
const READ_ALL_ROLE_IDS = [ADMIN_ROLE_ID, FACULTY_ADMIN_ROLE_ID, DEAN_ROLE_ID];

/** Every role that reads projects through the academic read endpoints. */
export const ACADEMIC_READER_ROLE_IDS = [
  ...READ_ALL_ROLE_IDS,
  DEPARTMENT_DIRECTOR_ROLE_ID,
  PROFESSOR_ROLE_ID,
  TUTOR_ROLE_ID,
];

/**
 * Projects a user may read through the academic read endpoints.
 *
 * - `all`: Admin, FacultyAdmin and Dean read every project.
 * - otherwise the union of: projects the user tutors (Tutor), projects of the course
 *   sections the user teaches (Professor) and projects of the course sections of the
 *   department the user directs (DepartmentDirector).
 */
export type ProjectReadScope =
  | { all: true }
  | {
      all: false;
      userId: number;
      asTutor: boolean;
      asProfessor: boolean;
      asDirector: boolean;
    };

/** Scope given by the user's active platform roles; null when no role grants any project. */
export function resolveReadScope(
  userId: number,
  roleIds: number[],
): ProjectReadScope | null {
  const has = (id: number) => roleIds.includes(id);
  if (READ_ALL_ROLE_IDS.some(has)) return { all: true };

  const scope = {
    all: false as const,
    userId,
    asTutor: has(TUTOR_ROLE_ID),
    asProfessor: has(PROFESSOR_ROLE_ID),
    asDirector: has(DEPARTMENT_DIRECTOR_ROLE_ID),
  };
  return scope.asTutor || scope.asProfessor || scope.asDirector ? scope : null;
}
