import { status } from '@grpc/grpc-js';
import { SetUserPlatformRolesUseCase } from '../set-user-platform-roles.use-case';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { User, UserStatus } from '@users/domain/entities/user.entity';
import { ROLES, buildAdministration, rpcError } from './account-administration.fixtures-spec';

describe('SetUserPlatformRolesUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;
  let administration: ReturnType<typeof buildAdministration>;

  const build = () =>
    new SetUserPlatformRolesUseCase(
      userRepository,
      administration.platformStaffRepository,
      administration.resolvePlatformRoles,
      administration.policy,
    );

  beforeEach(() => {
    userRepository = {
      findById: jest.fn((id: number) =>
        Promise.resolve(id === 999 ? null : new User(id, 'Name', null, `u${id}@iris.local`, 'x', null, true, UserStatus.CONFIRMED)),
      ),
    } as unknown as jest.Mocked<UserRepositoryPort>;
    administration = buildAdministration();
  });

  it('gives the Professor role to a user who signed up as User', async () => {
    const roles = await build().execute({ userId: 4, roleIds: [ROLES.Professor.id], actorUserId: 2 });

    expect(roles.map((role) => role.name)).toEqual(['Professor']);
    expect(administration.platformStaffRepository.setActiveRoles).toHaveBeenCalledWith(4, [ROLES.Professor.id]);
  });

  it('lets the principal admin make someone a faculty admin', async () => {
    await build().execute({ userId: 3, roleIds: [ROLES.FacultyAdmin.id], actorUserId: 1 });

    expect(administration.platformStaffRepository.setActiveRoles).toHaveBeenCalledWith(3, [ROLES.FacultyAdmin.id]);
  });

  it.each([
    ['grant Admin', 3, [ROLES.Admin.id]],
    ['grant FacultyAdmin', 3, [ROLES.FacultyAdmin.id]],
    ['change the roles of the principal admin', 1, [ROLES.User.id]],
  ])('does not let a faculty admin %s', async (_case, userId, roleIds) => {
    await expect(build().execute({ userId, roleIds, actorUserId: 2 })).rejects.toEqual(
      rpcError(status.PERMISSION_DENIED, 'principal administrator'),
    );
    expect(administration.platformStaffRepository.setActiveRoles).not.toHaveBeenCalled();
  });

  it('does not let anyone change their own roles', async () => {
    await expect(build().execute({ userId: 2, roleIds: [ROLES.Admin.id], actorUserId: 2 })).rejects.toEqual(
      rpcError(status.PERMISSION_DENIED, 'their own account'),
    );
  });

  it('does not remove the Admin role from the last active Admin', async () => {
    // User 1 also holds Admin, but its account is not active, so no other Admin counts
    administration = buildAdministration({ 1: ['Admin'], 5: ['Admin'] });
    administration.platformStaffRepository.countActiveAdminsByRoleId.mockResolvedValue(0);

    await expect(build().execute({ userId: 5, roleIds: [ROLES.User.id], actorUserId: 1 })).rejects.toEqual(
      rpcError(status.FAILED_PRECONDITION, 'without an active Admin'),
    );
  });

  it('rejects event roles', async () => {
    await expect(build().execute({ userId: 4, roleIds: [ROLES.Participant.id], actorUserId: 1 })).rejects.toEqual(
      rpcError(status.INVALID_ARGUMENT, 'event roles'),
    );
  });

  it('returns NOT_FOUND for a user that does not exist', async () => {
    await expect(build().execute({ userId: 999, roleIds: [ROLES.Professor.id], actorUserId: 1 })).rejects.toEqual(
      rpcError(status.NOT_FOUND),
    );
  });
});
