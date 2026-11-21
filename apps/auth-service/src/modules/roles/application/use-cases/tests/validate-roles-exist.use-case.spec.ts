import { ValidateRolesExistUseCase } from '../validate-roles-exist.use-case';
import { RoleRepositoryPort } from '../../../../roles/domain/repositories/role.repository.port';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('ValidateRolesExistUseCase', () => {
  let useCase: ValidateRolesExistUseCase;
  let mockRoleRepository: jest.Mocked<RoleRepositoryPort>;

  beforeEach(() => {
    mockRoleRepository = {
      countByIds: jest.fn(),
      findByIds: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<RoleRepositoryPort>;

    useCase = new ValidateRolesExistUseCase(mockRoleRepository);
  });

  describe('execute', () => {
    it('should not throw error when all roles exist', async () => {
      const roleIds = [1, 2, 3];

      mockRoleRepository.countByIds.mockResolvedValue(3);

      await expect(useCase.execute(roleIds)).resolves.not.toThrow();
      expect(mockRoleRepository.countByIds).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should throw INVALID_ARGUMENT when roleIds is empty', async () => {
      const roleIds: number[] = [];

      await expect(useCase.execute(roleIds)).rejects.toThrow(RpcException);
      await expect(useCase.execute(roleIds)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.INVALID_ARGUMENT,
            message: 'Se debe indicar al menos un rol',
          }),
        }),
      );

      expect(mockRoleRepository.countByIds).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when some roles do not exist', async () => {
      const roleIds = [1, 2, 999];

      mockRoleRepository.countByIds.mockResolvedValue(2); // Only 2 exist

      await expect(useCase.execute(roleIds)).rejects.toThrow(RpcException);
      await expect(useCase.execute(roleIds)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'Uno o más de los roles indicados no existen',
          }),
        }),
      );

      expect(mockRoleRepository.countByIds).toHaveBeenCalledWith([1, 2, 999]);
    });

    it('should handle duplicate role IDs and validate unique roles', async () => {
      const roleIds = [1, 2, 2, 3, 3];

      mockRoleRepository.countByIds.mockResolvedValue(3); // 3 unique roles

      await expect(useCase.execute(roleIds)).resolves.not.toThrow();
      expect(mockRoleRepository.countByIds).toHaveBeenCalledWith([1, 2, 3]); // Unique IDs
    });
  });
});
