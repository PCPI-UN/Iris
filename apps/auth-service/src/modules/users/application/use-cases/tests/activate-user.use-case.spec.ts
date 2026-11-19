import { ActivateUserUseCase } from '../activate-user.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '../../../../../common/ports/password-hasher.port';
import { ActivateUserDto } from '../../../../users/application/dto/activate-user.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('ActivateUserUseCase', () => {
  let useCase: ActivateUserUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockPasswordHasher: jest.Mocked<PasswordHasherPort>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      findByEmail: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    mockPasswordHasher = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as jest.Mocked<PasswordHasherPort>;

    useCase = new ActivateUserUseCase(mockUserRepository, mockPasswordHasher);
  });

  describe('execute', () => {
    it('should activate user successfully when user is PENDING', async () => {
      const activateDto: ActivateUserDto = {
        userId: 1,
        password: 'NewPassword123!',
      };

      const pendingUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'old-hashed-password',
        '1234567890',
        true,
        UserStatus.PENDING,
      );

      const activatedUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'new-hashed-password',
        '1234567890',
        true,
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findById.mockResolvedValue(pendingUser);
      mockPasswordHasher.hash.mockResolvedValue('new-hashed-password');
      mockUserRepository.save.mockResolvedValue(activatedUser);

      const result = await useCase.execute(activateDto);

      expect(result).toEqual({ success: true });
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith('NewPassword123!');
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'new-hashed-password',
          status: UserStatus.CONFIRMED,
        }),
      );
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      const activateDto: ActivateUserDto = {
        userId: 999,
        password: 'NewPassword123!',
      };

      mockUserRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(activateDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(activateDto)).rejects.toThrow(
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

    it('should throw FAILED_PRECONDITION when user is not PENDING', async () => {
      const activateDto: ActivateUserDto = {
        userId: 1,
        password: 'NewPassword123!',
      };

      const confirmedUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '1234567890',
        true,
        UserStatus.CONFIRMED, // Already confirmed
      );

      mockUserRepository.findById.mockResolvedValue(confirmedUser);

      await expect(useCase.execute(activateDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(activateDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.FAILED_PRECONDITION,
            message: 'El usuario no está pendiente de activación',
          }),
        }),
      );

      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });
});
