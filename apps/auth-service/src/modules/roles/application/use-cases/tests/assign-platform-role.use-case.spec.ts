import { AssignPlatformRoleUseCase } from '../assign-platform-role.use-case';
import { PlatformStaffRepositoryPort } from '@roles/domain/repositories/platform-staff.repository.port';

describe('AssignPlatformRoleUseCase', () => {
  let useCase: AssignPlatformRoleUseCase;
  let repository: { assignRoles: jest.Mock };

  beforeEach(() => {
    repository = { assignRoles: jest.fn().mockResolvedValue(undefined) };
    useCase = new AssignPlatformRoleUseCase(
      repository as unknown as PlatformStaffRepositoryPort,
    );
  });

  it('delegates the assignment to the repository', async () => {
    await useCase.execute(1, [1, 2, 3]);

    expect(repository.assignRoles).toHaveBeenCalledWith(1, [1, 2, 3]);
  });

  it('passes an empty role list through unchanged', async () => {
    await useCase.execute(1, []);

    expect(repository.assignRoles).toHaveBeenCalledWith(1, []);
  });

  it('propagates repository errors', async () => {
    repository.assignRoles.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute(1, [1])).rejects.toThrow('db down');
  });
});
