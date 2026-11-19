import { CreateBasicUserUseCase } from '../create-basic-user.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '../../../../../common/ports/password-hasher.port';
import { CreateBasicUserDto } from '../../../../users/application/dto/create-basic-user.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('CreateBasicUserUseCase', () => {
  let useCase: CreateBasicUserUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockPasswordHasher: jest.Mocked<PasswordHasherPort>;

  beforeEach(() => {
    mockUserRepository = {
      save: jest.fn(),
      findById: jest.fn(),
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

    useCase = new CreateBasicUserUseCase(mockUserRepository, mockPasswordHasher);
  });

  describe('execute', () => {
    it('should create basic user successfully when email does not exist', async () => {
      const createDto: CreateBasicUserDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
      };

      const createdUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '1234567890',
        true,
        UserStatus.PENDING,
      );

      mockUserRepository.existsByEmail.mockResolvedValue(false);
      mockUserRepository.existsByPhone.mockResolvedValue(false);
      mockPasswordHasher.hash.mockResolvedValue('hashed-password');
      mockUserRepository.save.mockResolvedValue(createdUser);

      const result = await useCase.execute(createDto);

      expect(result).toEqual(createdUser);
      expect(mockUserRepository.existsByEmail).toHaveBeenCalledWith('john@example.com');
      expect(mockUserRepository.existsByPhone).toHaveBeenCalledWith('1234567890');
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith(
        expect.stringMatching(/^[a-f0-9]{32}$/), // Random hex password
      );
      expect(mockUserRepository.save).toHaveBeenCalled();
    });

    it('should return existing inactive user when email exists but user is inactive', async () => {
      const createDto: CreateBasicUserDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'existing@example.com',
        phone: '1234567890',
      };

      const existingInactiveUser = new User(
        1,
        'John',
        'Doe',
        'existing@example.com',
        'hashed-password',
        '1234567890',
        false, // inactive
        UserStatus.CONFIRMED,
      );

      mockUserRepository.existsByEmail.mockResolvedValue(true);
      mockUserRepository.findByEmail.mockResolvedValue(existingInactiveUser);

      const result = await useCase.execute(createDto);

      expect(result).toEqual(existingInactiveUser);
      expect(mockPasswordHasher.hash).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ALREADY_EXISTS when active user with email exists', async () => {
      const createDto: CreateBasicUserDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'active@example.com',
        phone: '1234567890',
      };

      const existingActiveUser = new User(
        1,
        'John',
        'Doe',
        'active@example.com',
        'hashed-password',
        '1234567890',
        true, // active
        UserStatus.CONFIRMED,
      );

      mockUserRepository.existsByEmail.mockResolvedValue(true);
      mockUserRepository.findByEmail.mockResolvedValue(existingActiveUser);

      await expect(useCase.execute(createDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(createDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.ALREADY_EXISTS,
            message: 'Ya existe un usuario activo con este correo',
          }),
        }),
      );

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ALREADY_EXISTS when phone already exists', async () => {
      const createDto: CreateBasicUserDto = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '1234567890',
      };

      mockUserRepository.existsByEmail.mockResolvedValue(false);
      mockUserRepository.existsByPhone.mockResolvedValue(true);

      await expect(useCase.execute(createDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(createDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.ALREADY_EXISTS,
            message: 'Ya existe otro usuario con este número de teléfono',
          }),
        }),
      );

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });
});
