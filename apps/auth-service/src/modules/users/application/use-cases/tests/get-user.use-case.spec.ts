import { GetUserUseCase } from '../get-user.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { GetUserDto } from '../../../../users/application/dto/get-user.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('GetUserUseCase', () => {
  let useCase: GetUserUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    useCase = new GetUserUseCase(mockUserRepository);
  });

  describe('execute', () => {
    it('should return user when user exists', async () => {
      const getUserDto: GetUserDto = { id: 1 };
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

      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await useCase.execute(getUserDto);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      const getUserDto: GetUserDto = { id: 999 };

      mockUserRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(getUserDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(getUserDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'No se encontró el usuario con ID #999',
          }),
        }),
      );
    });

    it('should return inactive user if found', async () => {
      const getUserDto: GetUserDto = { id: 2 };
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

      mockUserRepository.findById.mockResolvedValue(inactiveUser);

      const result = await useCase.execute(getUserDto);

      expect(result).toEqual(inactiveUser);
      expect(result.active).toBe(false);
    });
  });
});
