import { AssignPlatformRolesPublicUseCase } from '../assign-platform-roles-public.use-case';
import { ValidateRolesExistUseCase } from '../validate-roles-exist.use-case';
import { AssignPlatformRoleUseCase } from '../assign-platform-role.use-case';
import { AssignPlatformRolesDto } from '../../../../roles/application/dto/assign-platform-roles.dto';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('AssignPlatformRolesPublicUseCase', () => {
  let useCase: AssignPlatformRolesPublicUseCase;
  let mockValidateRolesExistUseCase: jest.Mocked<ValidateRolesExistUseCase>;
  let mockAssignPlatformRoleUseCase: jest.Mocked<AssignPlatformRoleUseCase>;

  beforeEach(() => {
    mockValidateRolesExistUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ValidateRolesExistUseCase>;

    mockAssignPlatformRoleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignPlatformRoleUseCase>;

    useCase = new AssignPlatformRolesPublicUseCase(
      mockValidateRolesExistUseCase,
      mockAssignPlatformRoleUseCase,
    );
  });

  describe('execute', () => {
    it('should validate roles and assign them to user successfully', async () => {
      const dto: AssignPlatformRolesDto = {
        userId: 1,
        roleIds: [1, 2, 3],
      };

      mockValidateRolesExistUseCase.execute.mockResolvedValue(undefined);
      mockAssignPlatformRoleUseCase.execute.mockResolvedValue(undefined);

      const result = await useCase.execute(dto);

      expect(result).toEqual({ success: true });
      expect(mockValidateRolesExistUseCase.execute).toHaveBeenCalledWith([1, 2, 3]);
      expect(mockAssignPlatformRoleUseCase.execute).toHaveBeenCalledWith(1, [1, 2, 3]);
    });

    it('should throw error when role validation fails', async () => {
      const dto: AssignPlatformRolesDto = {
        userId: 1,
        roleIds: [999],
      };

      mockValidateRolesExistUseCase.execute.mockRejectedValue(
        new RpcException({
          code: status.NOT_FOUND,
          message: 'Uno o más de los roles indicados no existen',
        }),
      );

      await expect(useCase.execute(dto)).rejects.toThrow(RpcException);
      expect(mockAssignPlatformRoleUseCase.execute).not.toHaveBeenCalled();
    });

    it('should validate roles before assigning', async () => {
      const dto: AssignPlatformRolesDto = {
        userId: 1,
        roleIds: [1, 2],
      };

      let validateCalled = false;
      mockValidateRolesExistUseCase.execute.mockImplementation(async () => {
        validateCalled = true;
      });

      mockAssignPlatformRoleUseCase.execute.mockImplementation(async () => {
        expect(validateCalled).toBe(true);
      });

      await useCase.execute(dto);

      expect(mockValidateRolesExistUseCase.execute).toHaveBeenCalled();
      expect(mockAssignPlatformRoleUseCase.execute).toHaveBeenCalled();
    });
  });
});
