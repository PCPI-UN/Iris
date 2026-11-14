import { status } from '@grpc/grpc-js';
import { DeactivateUserUseCase } from '../deactivate-user.use-case';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { User, UserStatus } from '@users/domain/entities/user.entity';
import { USERS, buildAdministration, rpcError } from './account-administration.fixtures-spec';

describe('DeactivateUserUseCase', () => {
  let userRepository: jest.Mocked<UserRepositoryPort>;

  const build = (users = USERS) => {
    const { policy } = buildAdministration(users);
    return new DeactivateUserUseCase(userRepository, policy);
  };

  beforeEach(() => {
    userRepository = {
      findById: jest.fn((id: number) =>
        Promise.resolve(id === 999 ? null : new User(id, 'Name', null, `u${id}@iris.local`, 'x', null, true, UserStatus.CONFIRMED)),
      ),
      deactivate: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserRepositoryPort>;
  });

  it('lets a faculty admin deactivate a professor', async () => {
    await expect(build().execute({ id: 3, actorUserId: 2 })).resolves.toEqual({ success: true });
    expect(userRepository.deactivate).toHaveBeenCalledWith(3);
  });

  it('returns NOT_FOUND for a user that does not exist', async () => {
    await expect(build().execute({ id: 999, actorUserId: 1 })).rejects.toEqual(rpcError(status.NOT_FOUND));
  });

  it('does not let a faculty admin deactivate the principal admin', async () => {
    await expect(build().execute({ id: 1, actorUserId: 2 })).rejects.toEqual(
      rpcError(status.PERMISSION_DENIED, 'administrator account'),
    );
    expect(userRepository.deactivate).not.toHaveBeenCalled();
  });

  it('does not let a user deactivate their own account', async () => {
    await expect(build().execute({ id: 1, actorUserId: 1 })).rejects.toEqual(
      rpcError(status.PERMISSION_DENIED, 'their own account'),
    );
  });

  it('lets the principal admin deactivate another admin while one remains', async () => {
    await expect(build().execute({ id: 5, actorUserId: 1 })).resolves.toEqual({ success: true });
  });

  it('never deactivates the last active Admin', async () => {
    // The actor kept the role row but its account is no longer active, so it does not count
    const users = { 1: ['Admin'], 5: ['Admin'] } as typeof USERS;
    const { policy, platformStaffRepository } = buildAdministration(users);
    platformStaffRepository.countActiveAdminsByRoleId.mockResolvedValue(0);

    await expect(new DeactivateUserUseCase(userRepository, policy).execute({ id: 5, actorUserId: 1 })).rejects.toEqual(
      rpcError(status.FAILED_PRECONDITION, 'without an active Admin'),
    );
  });
});
