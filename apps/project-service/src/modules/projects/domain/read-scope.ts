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

/** One scope a caller may ask for, instead of the union of every scope of the user */
export type RequestedReadScope = 'all' | 'tutored' | 'course' | 'department';

/** Permission that grants each requested scope */
export const REQUESTED_SCOPE_PERMISSION: Record<RequestedReadScope, string> = {
  all: READ_ALL_ACADEMIC_PROJECTS,
  tutored: READ_TUTORED_ACADEMIC_PROJECTS,
  course: READ_COURSE_ACADEMIC_PROJECTS,
  department: READ_DEPARTMENT_ACADEMIC_PROJECTS,
};

/**
 * Scope given by the user's platform permissions; null when none of them grants projects.
 *
 * Without `requested` it is the union of every scope the permissions grant. With it, only
 * that scope, and null when the user lacks its permission: a Professor who also tutors asks
 * for `tutored` and reads only the projects they tutor, not the ones of their course sections.
 */
export function resolveReadScope(
  userId: number,
  permissions: string[],
  requested?: RequestedReadScope,
): ProjectReadScope | null {
  const has = (permission: string) => permissions.includes(permission);
  if (requested) {
    if (!has(REQUESTED_SCOPE_PERMISSION[requested])) return null;
    if (requested === 'all') return { all: true };
    return {
      all: false,
      userId,
      tutored: requested === 'tutored',
      ofCourses: requested === 'course',
      ofDepartment: requested === 'department',
    };
  }
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
