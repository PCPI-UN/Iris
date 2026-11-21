import { GetUserByEmailUseCase } from '../get-user-by-email.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { GetUserByEmailDto } from '../../../../users/application/dto/get-user-by-email.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('GetUserByEmailUseCase', () => {
  let useCase: GetUserByEmailUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    useCase = new GetUserByEmailUseCase(mockUserRepository);
  });

  describe('execute', () => {
    it('should return user when user exists with given email', async () => {
      const getUserDto: GetUserByEmailDto = { email: 'john@example.com' };
      const mockUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '1234567890',
        true,
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      const result = await useCase.execute(getUserDto);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('john@example.com');
    });

    it('should throw NOT_FOUND when user with email does not exist', async () => {
      const getUserDto: GetUserByEmailDto = { email: 'nonexistent@example.com' };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(useCase.execute(getUserDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(getUserDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'No se encontró el usuario con el correo nonexistent@example.com',
          }),
        }),
      );
    });

    it('should return inactive user if found by email', async () => {
      const getUserDto: GetUserByEmailDto = { email: 'jane@example.com' };
      const inactiveUser = new User(
        2,
        'Jane',
        'Smith',
        'jane@example.com',
        'hashed-password',
        '9876543210',
        false, // inactive
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findByEmail.mockResolvedValue(inactiveUser);

      const result = await useCase.execute(getUserDto);

      expect(result).toEqual(inactiveUser);
      expect(result.active).toBe(false);
    });
  });
});
