/**
 * Permissions that decide which projects a user reads through the academic read endpoints
 * (`read:academic_projects` only opens the endpoints in the gateway). Granting or removing
 * one of them to a role is a row in auth-service role_permissions; no role id is fixed here.
 * Admin needs `read_all` granted explicitly: the Admin bypass of the gateway guard does not
 * reach project-service.
 */
export const READ_ALL_ACADEMIC_PROJECTS = 'read_all:academic_projects';
export const READ_TUTORED_ACADEMIC_PROJECTS = 'read_tutored:academic_projects';
export const READ_COURSE_ACADEMIC_PROJECTS = 'read_course:academic_projects';
export const READ_DEPARTMENT_ACADEMIC_PROJECTS = 'read_department:academic_projects';

/**
 * Projects a user may read through the academic read endpoints.
 *
 * - `all`: every project (`read_all`).
 * - otherwise the union of: projects the user tutors (`tutored`), projects of the course
 *   sections the user teaches (`ofCourses`) and projects of the course sections of the
 *   department the user directs (`ofDepartment`).
 */
export type ProjectReadScope =
  | { all: true }
  | {
      all: false;
      userId: number;
      tutored: boolean;
      ofCourses: boolean;
      ofDepartment: boolean;
    };

/** Scope given by the user's platform permissions; null when none of them grants projects. */
export function resolveReadScope(
  userId: number,
  permissions: string[],
): ProjectReadScope | null {
  const has = (permission: string) => permissions.includes(permission);
  if (has(READ_ALL_ACADEMIC_PROJECTS)) return { all: true };

  const scope = {
    all: false as const,
    userId,
    tutored: has(READ_TUTORED_ACADEMIC_PROJECTS),
    ofCourses: has(READ_COURSE_ACADEMIC_PROJECTS),
    ofDepartment: has(READ_DEPARTMENT_ACADEMIC_PROJECTS),
  };
  return scope.tutored || scope.ofCourses || scope.ofDepartment ? scope : null;
}
