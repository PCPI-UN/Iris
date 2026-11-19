import { SetPasswordUseCase } from '../set-password.use-case';
import { ValidateTokenUseCase } from '../validate-token.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '../../../../../common/ports/password-hasher.port';
import { UserTokenRepositoryPort } from '../../../../users/domain/repositories/user-token.repository.port';
import { SetPasswordDto } from '../../../../auth/application/dto/set-password.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('SetPasswordUseCase', () => {
  let useCase: SetPasswordUseCase;
  let mockValidateTokenUseCase: jest.Mocked<ValidateTokenUseCase>;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockPasswordHasher: jest.Mocked<PasswordHasherPort>;
  let mockUserTokenRepository: jest.Mocked<UserTokenRepositoryPort>;

  beforeEach(() => {
    mockValidateTokenUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ValidateTokenUseCase>;

    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      findByEmail: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    mockPasswordHasher = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as jest.Mocked<PasswordHasherPort>;

    mockUserTokenRepository = {
      delete: jest.fn(),
      findByToken: jest.fn(),
      save: jest.fn(),
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserTokenRepositoryPort>;

    useCase = new SetPasswordUseCase(
      mockValidateTokenUseCase,
      mockUserRepository,
      mockPasswordHasher,
      mockUserTokenRepository,
    );
  });

  describe('execute', () => {
    it('should set password successfully and update user status to CONFIRMED', async () => {
      const setPasswordDto: SetPasswordDto = {
        token: 'valid-setup-token',
        password: 'NewPassword123!',
      };

      const mockUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'oldHashedPassword',
        '123456789',
        true,
        UserStatus.PENDING,
      );

      mockValidateTokenUseCase.execute.mockResolvedValue({
        valid: true,
        userId: 1,
      });
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockPasswordHasher.hash.mockResolvedValue('newHashedPassword');
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockUserTokenRepository.delete.mockResolvedValue(undefined);

      const result = await useCase.execute(setPasswordDto);

      expect(result).toEqual({ success: true });
      expect(mockValidateTokenUseCase.execute).toHaveBeenCalledWith('valid-setup-token');
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('NewPassword123!');
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'newHashedPassword',
          status: UserStatus.CONFIRMED,
        }),
      );
      expect(mockUserTokenRepository.delete).toHaveBeenCalledWith('valid-setup-token');
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      const setPasswordDto: SetPasswordDto = {
        token: 'valid-token',
        password: 'NewPassword123!',
      };

      mockValidateTokenUseCase.execute.mockResolvedValue({
        valid: true,
        userId: 999,
      });
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(setPasswordDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(setPasswordDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'No se encontró el usuario',
          }),
        }),
      );

      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when token validation fails', async () => {
      const setPasswordDto: SetPasswordDto = {
        token: 'invalid-token',
        password: 'NewPassword123!',
      };

      mockValidateTokenUseCase.execute.mockRejectedValue(
        new RpcException({
          code: status.NOT_FOUND,
          message: 'Token not found',
        }),
      );

      await expect(useCase.execute(setPasswordDto)).rejects.toThrow(RpcException);

      expect(mockUserRepository.findById).not.toHaveBeenCalled();
      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
    });

    it('should delete the token after successful password set', async () => {
      const setPasswordDto: SetPasswordDto = {
        token: 'valid-setup-token',
        password: 'NewPassword123!',
      };

      const mockUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'oldHashedPassword',
        '123456789',
        true,
        UserStatus.PENDING,
      );

      mockValidateTokenUseCase.execute.mockResolvedValue({
        valid: true,
        userId: 1,
      });
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockPasswordHasher.hash.mockResolvedValue('newHashedPassword');
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockUserTokenRepository.delete.mockResolvedValue(undefined);

      await useCase.execute(setPasswordDto);

      expect(mockUserTokenRepository.delete).toHaveBeenCalledWith('valid-setup-token');
    });
  });
});
