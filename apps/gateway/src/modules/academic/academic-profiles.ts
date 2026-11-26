import { ForbiddenException } from '@nestjs/common';
import { AcademicScope } from '@app/common/generated/project';
import { AppUser } from '../auth/types/app-user.type';

/** Academic screen of the caller; each one comes from a platform role */
export enum AcademicProfile {
  PROFESSOR = 'PROFESSOR',
  TUTOR = 'TUTOR',
  DIRECTOR = 'DIRECTOR',
  DEAN = 'DEAN',
}

/**
 * The only place that ties an academic profile to its platform role and to the scope
 * project-service applies for it (each scope is granted by a permission of the same name:
 * COURSE is read_course:academic_projects, and so on).
 *
 * - PROFESSOR: role Professor, the projects of the course sections (NRC) they teach.
 * - TUTOR: role Tutor, the projects they tutor.
 * - DIRECTOR: role DepartmentDirector, the projects of the course sections of their department.
 * - DEAN: role Dean, every project.
 *
 * Admin and FacultyAdmin have no academic profile: they read projects from the admin panel.
 * The order is the one /academic/profiles returns.
 */
export const ACADEMIC_PROFILES: Record<
  AcademicProfile,
  { role: string; scope: AcademicScope }
> = {
  [AcademicProfile.PROFESSOR]: {
    role: 'Professor',
    scope: AcademicScope.ACADEMIC_SCOPE_COURSE,
  },
  [AcademicProfile.TUTOR]: {
    role: 'Tutor',
    scope: AcademicScope.ACADEMIC_SCOPE_TUTORED,
  },
  [AcademicProfile.DIRECTOR]: {
    role: 'DepartmentDirector',
    scope: AcademicScope.ACADEMIC_SCOPE_DEPARTMENT,
  },
  [AcademicProfile.DEAN]: {
    role: 'Dean',
    scope: AcademicScope.ACADEMIC_SCOPE_ALL,
  },
};

/** Profiles of the user, one per academic platform role they hold */
export function academicProfilesOf(user: AppUser): AcademicProfile[] {
  const roles = new Set((user.platformRoles ?? []).map((role) => role.name));
  return Object.values(AcademicProfile).filter((profile) =>
    roles.has(ACADEMIC_PROFILES[profile].role),
  );
}

/** Scope project-service applies for the profile; 403 when the user lacks its role */
export function profileScope(
  user: AppUser,
  profile: AcademicProfile,
): AcademicScope {
  if (!academicProfilesOf(user).includes(profile)) {
    throw new ForbiddenException(
      `El usuario no tiene el perfil académico ${profile}`,
    );
  }
  return ACADEMIC_PROFILES[profile].scope;
}

/**
 * Profiles that download award diplomas of their scope (matrix of views: the director
 * those of their department, the dean all; professors and tutors do not). Students get
 * their own from /events/:eventId/my-project/diploma.
 */
export const DIPLOMA_PROFILES: readonly AcademicProfile[] = [
  AcademicProfile.DIRECTOR,
  AcademicProfile.DEAN,
];
