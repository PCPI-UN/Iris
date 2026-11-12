import { ActiveRole, PlatformStaffRepositoryPort } from '@roles/domain/repositories/platform-staff.repository.port';
import { RoleRepositoryPort } from '@roles/domain/repositories/role.repository.port';
import { Role } from '@roles/domain/entities/role.entity';
import { AccountAdministrationPolicy } from '@roles/application/services/account-administration.policy';
import { ResolvePlatformRolesUseCase } from '@roles/application/use-cases/resolve-platform-roles.use-case';

/** Role catalogue of the migration (fixed ids). */
export const ROLES = {
  Admin: new Role(1, 'Admin', 'Admin', 'PLATFORM'),
  EventManager: new Role(2, 'EventManager', 'EventManager', 'PLATFORM'),
  User: new Role(3, 'User', 'User', 'PLATFORM'),
  Juror: new Role(4, 'Juror', 'Juror', 'EVENT'),
  Participant: new Role(5, 'Participant', 'Participant', 'EVENT'),
  FacultyAdmin: new Role(6, 'FacultyAdmin', 'FacultyAdmin', 'PLATFORM'),
  Dean: new Role(7, 'Dean', 'Dean', 'PLATFORM'),
  DepartmentDirector: new Role(8, 'DepartmentDirector', 'DepartmentDirector', 'PLATFORM'),
  Professor: new Role(9, 'Professor', 'Professor', 'PLATFORM'),
  Tutor: new Role(10, 'Tutor', 'Tutor', 'PLATFORM'),
};

const PERMISSIONS: Record<string, string[]> = {
  Admin: ['manage:admins', 'manage:user_roles', 'create:users', 'delete:users'],
  FacultyAdmin: ['manage:user_roles', 'create:users', 'delete:users'],
};

/**
 * Users of the scenarios: 1 principal admin, 2 faculty admin, 3 professor, 4 student,
 * 5 a second principal admin.
 */
export const USERS: Record<number, (keyof typeof ROLES)[]> = {
  1: ['Admin'],
  2: ['FacultyAdmin'],
  3: ['Professor'],
  4: ['User'],
  5: ['Admin'],
};

export function buildAdministration(users: Record<number, (keyof typeof ROLES)[]> = USERS) {
  const activeRoles = (userId: number): ActiveRole[] =>
    (users[userId] ?? []).map((name) => ({
      id: ROLES[name].id,
      name,
      scope: ROLES[name].scope,
      permissions: PERMISSIONS[name] ?? [],
    }));

  const platformStaffRepository = {
    findActiveRoles: jest.fn((userId: number) => Promise.resolve(activeRoles(userId))),
    setActiveRoles: jest.fn().mockResolvedValue(undefined),
    // Other active users holding the role
    countActiveAdminsByRoleId: jest.fn((roleId: number, excludeUserId: number) =>
      Promise.resolve(
        Object.entries(users).filter(
          ([userId, roles]) =>
            Number(userId) !== excludeUserId && roles.some((name) => ROLES[name].id === roleId),
        ).length,
      ),
    ),
    findByUserIdAndRoleId: jest.fn(),
    deactivate: jest.fn(),
    assignRoles: jest.fn(),
  } as unknown as jest.Mocked<PlatformStaffRepositoryPort>;

  const roleRepository = {
    findByIds: jest.fn((ids: number[]) =>
      Promise.resolve(Object.values(ROLES).filter((role) => ids.includes(role.id))),
    ),
    countByIds: jest.fn(),
    findAll: jest.fn(),
  } as unknown as jest.Mocked<RoleRepositoryPort>;

  return {
    platformStaffRepository,
    roleRepository,
    policy: new AccountAdministrationPolicy(platformStaffRepository),
    resolvePlatformRoles: new ResolvePlatformRolesUseCase(roleRepository),
  };
}

export const rpcError = (code: number, message?: string) =>
  expect.objectContaining({
    error: expect.objectContaining({
      code,
      ...(message && { message: expect.stringContaining(message) }),
    }),
  });
