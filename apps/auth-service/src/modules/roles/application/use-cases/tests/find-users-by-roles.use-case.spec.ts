import { FindUsersByRolesUseCase } from '../find-users-by-roles.use-case';
import { PlatformStaffRepositoryPort } from '@roles/domain/repositories/platform-staff.repository.port';

describe('FindUsersByRolesUseCase', () => {
  let useCase: FindUsersByRolesUseCase;
  let repository: { findActiveUsersByRoles: jest.Mock };

  beforeEach(() => {
    repository = { findActiveUsersByRoles: jest.fn().mockResolvedValue([]) };
    useCase = new FindUsersByRolesUseCase(
      repository as unknown as PlatformStaffRepositoryPort,
    );
  });

  it('returns an empty list without querying when no roles are given', async () => {
    await expect(useCase.execute({ roleIds: [] })).resolves.toEqual([]);
    await expect(useCase.execute({})).resolves.toEqual([]);
    expect(repository.findActiveUsersByRoles).not.toHaveBeenCalled();
  });

  it('uses a limit of 10 by default', async () => {
    await useCase.execute({ roleIds: [9, 10] });

    expect(repository.findActiveUsersByRoles).toHaveBeenCalledWith({
      roleIds: [9, 10],
      search: undefined,
      userIds: undefined,
      limit: 10,
    });
  });

  it('caps the limit at 10 and keeps smaller ones', async () => {
    await useCase.execute({ roleIds: [9], limit: 50 });
    await useCase.execute({ roleIds: [9], limit: 3 });

    expect(repository.findActiveUsersByRoles).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: 10 }),
    );
    expect(repository.findActiveUsersByRoles).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 3 }),
    );
  });

  it('raises a limit lower than 1 to 1', async () => {
    await useCase.execute({ roleIds: [9], limit: 0 });

    expect(repository.findActiveUsersByRoles).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('trims the search, drops a blank one and removes repeated ids', async () => {
    await useCase.execute({
      roleIds: [9, 9, 10],
      search: '  ana  ',
      userIds: [4, 4, 7],
    });
    await useCase.execute({ roleIds: [9], search: '   ', userIds: [] });

    expect(repository.findActiveUsersByRoles).toHaveBeenNthCalledWith(1, {
      roleIds: [9, 10],
      search: 'ana',
      userIds: [4, 7],
      limit: 2,
    });
    expect(repository.findActiveUsersByRoles).toHaveBeenNthCalledWith(2, {
      roleIds: [9],
      search: undefined,
      userIds: undefined,
      limit: 10,
    });
  });

  it('uses the number of ids as the limit when looking up by ids, even above 10', async () => {
    const userIds = Array.from({ length: 11 }, (_, index) => index + 1);
    await useCase.execute({ roleIds: [9], userIds, limit: 3 });

    expect(repository.findActiveUsersByRoles).toHaveBeenCalledWith(
      expect.objectContaining({ userIds, limit: 11 }),
    );
  });

  it('returns what the repository finds', async () => {
    const users = [{ id: 1, firstName: 'Ana', lastName: null, roleIds: [10] }];
    repository.findActiveUsersByRoles.mockResolvedValue(users);

    await expect(useCase.execute({ roleIds: [10] })).resolves.toBe(users);
  });
});
