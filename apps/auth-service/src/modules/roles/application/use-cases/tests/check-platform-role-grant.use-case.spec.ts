import { RpcException } from '@nestjs/microservices';
import { CheckPlatformRoleGrantUseCase } from '../check-platform-role-grant.use-case';
import { ResolvePlatformRolesUseCase } from '../resolve-platform-roles.use-case';
import { AccountAdministrationPolicy } from '../../services/account-administration.policy';
import { PlatformStaffRepositoryPort } from '@roles/domain/repositories/platform-staff.repository.port';
import { RoleRepositoryPort } from '@roles/domain/repositories/role.repository.port';

const ROLES = [
  { id: 1, name: 'Admin', scope: 'PLATFORM' },
  { id: 2, name: 'EventManager', scope: 'PLATFORM' },
  { id: 4, name: 'Juror', scope: 'EVENT' },
  { id: 6, name: 'FacultyAdmin', scope: 'PLATFORM' },
  { id: 7, name: 'Dean', scope: 'PLATFORM' },
];

const ACTOR_ROLES: Record<number, Array<{ id: number; name: string; permissions: string[] }>> = {
  1: [{ id: 1, name: 'Admin', permissions: ['manage:admins', 'create:invitations'] }],
  6: [{ id: 6, name: 'FacultyAdmin', permissions: ['create:invitations'] }],
  3: [{ id: 3, name: 'User', permissions: [] }],
};

describe('CheckPlatformRoleGrantUseCase', () => {
  const roleRepository = {
    findByIds: jest.fn(async (ids: number[]) => ROLES.filter((role) => ids.includes(role.id))),
  } as unknown as RoleRepositoryPort;
  const platformStaffRepository = {
    findActiveRoles: jest.fn(async (userId: number) => ACTOR_ROLES[userId] ?? []),
  } as unknown as PlatformStaffRepositoryPort;

  const useCase = new CheckPlatformRoleGrantUseCase(
    new ResolvePlatformRolesUseCase(roleRepository),
    new AccountAdministrationPolicy(platformStaffRepository),
  );

  it('lets the principal Admin grant Admin', async () => {
    await expect(useCase.execute({ actorUserId: 1, roleIds: [1], targetUserId: 9 })).resolves.toHaveLength(1);
  });

  it('lets a faculty admin grant a non-administrator role', async () => {
    await expect(useCase.execute({ actorUserId: 6, roleIds: [7], targetUserId: 9 })).resolves.toHaveLength(1);
  });

  it.each([1, 6])('does not let a faculty admin or a plain user grant role %i', async (roleId) => {
    await expect(useCase.execute({ actorUserId: 6, roleIds: [roleId] })).rejects.toThrow(RpcException);
    await expect(useCase.execute({ actorUserId: 3, roleIds: [roleId] })).rejects.toThrow(RpcException);
  });

  it('does not let anyone grant roles to themselves', async () => {
    await expect(useCase.execute({ actorUserId: 1, roleIds: [2], targetUserId: 1 })).rejects.toThrow(RpcException);
  });

  it('rejects event roles as platform roles', async () => {
    await expect(useCase.execute({ actorUserId: 1, roleIds: [4] })).rejects.toThrow(RpcException);
  });
});
