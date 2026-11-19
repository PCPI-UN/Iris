import { UpdateUserUseCase } from '../update-user.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { UpdateUserDto } from '../../../../users/application/dto/update-user.dto';
import {
  User,
  UserStatus,
} from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { AccountAdministrationPolicy } from '../../../../roles/application/services/account-administration.policy';

describe('UpdateUserUseCase', () => {
  let useCase: UpdateUserUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockPolicy: { loadActor: jest.Mock; assertCanManageAccount: jest.Mock };

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      existsByPhone: jest.fn(),
      findByEmail: jest.fn(),
      existsByEmail: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findAll: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    mockPolicy = {
      loadActor: jest.fn().mockResolvedValue({ id: 50 }),
      assertCanManageAccount: jest.fn().mockResolvedValue(undefined),
    };

    useCase = new UpdateUserUseCase(
      mockUserRepository,
      mockPolicy as unknown as AccountAdministrationPolicy,
    );
  });

  describe('execute', () => {
    it('should update user successfully with all fields', async () => {
      const updateDto: UpdateUserDto = {
        id: 1,
        firstName: 'UpdatedJohn',
        lastName: 'UpdatedDoe',
        phone: '9999999999',
      };

      const existingUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '1234567890',
        true,
        UserStatus.CONFIRMED,
      );

      const updatedUser = new User(
        1,
        'UpdatedJohn',
        'UpdatedDoe',
        'john@example.com',
        'hashed-password',
        '9999999999',
        true,
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.existsByPhone.mockResolvedValue(false);
      mockUserRepository.save.mockResolvedValue(updatedUser);

      const result = await useCase.execute(updateDto);

      expect(result).toEqual(updatedUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockUserRepository.existsByPhone).toHaveBeenCalledWith(
        '9999999999',
      );
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'UpdatedJohn',
          lastName: 'UpdatedDoe',
          phone: '9999999999',
        }),
      );
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      const updateDto: UpdateUserDto = {
        id: 999,
        firstName: 'UpdatedJohn',
      };

      mockUserRepository.findById.mockResolvedValue(null);

      await expect(useCase.execute(updateDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(updateDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'No se encontró el usuario con ID #999',
          }),
        }),
      );

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ALREADY_EXISTS when phone number is already taken', async () => {
      const updateDto: UpdateUserDto = {
        id: 1,
        phone: '9999999999',
      };

      const existingUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '1234567890',
        true,
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.existsByPhone.mockResolvedValue(true);

      await expect(useCase.execute(updateDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(updateDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.ALREADY_EXISTS,
            message: 'Ya existe otro usuario con este número de teléfono',
          }),
        }),
      );

      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should not check phone existence if phone is unchanged', async () => {
      const updateDto: UpdateUserDto = {
        id: 1,
        firstName: 'UpdatedJohn',
        phone: '1234567890', // Same phone
      };

      const existingUser = new User(
        1,
        'John',
        'Doe',
        'john@example.com',
        'hashed-password',
        '1234567890',
        true,
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findById.mockResolvedValue(existingUser);
      mockUserRepository.save.mockResolvedValue(existingUser);

      await useCase.execute(updateDto);

      expect(mockUserRepository.existsByPhone).not.toHaveBeenCalled();
    });

    it('checks the administration policy when an administrator edits the account', async () => {
      mockUserRepository.findById.mockResolvedValue(
        new User(
          1,
          'John',
          'Doe',
          'john@example.com',
          'x',
          '1234567890',
          true,
          UserStatus.CONFIRMED,
        ),
      );
      mockPolicy.assertCanManageAccount.mockRejectedValue(
        new RpcException({ code: status.PERMISSION_DENIED, message: 'denied' }),
      );

      await expect(
        useCase.execute({ id: 1, firstName: 'Otro', actorUserId: 50 }),
      ).rejects.toThrow(RpcException);

      expect(mockPolicy.loadActor).toHaveBeenCalledWith(50);
      expect(mockPolicy.assertCanManageAccount).toHaveBeenCalledWith(
        { id: 50 },
        1,
      );
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('does not check the policy on internal calls without an actor', async () => {
      mockUserRepository.findById.mockResolvedValue(
        new User(
          1,
          'John',
          'Doe',
          'john@example.com',
          'x',
          '1234567890',
          true,
          UserStatus.CONFIRMED,
        ),
      );
      mockUserRepository.save.mockImplementation(async (user) => user);

      await useCase.execute({ id: 1, firstName: 'Otro' });

      expect(mockPolicy.loadActor).not.toHaveBeenCalled();
    });
  });
});
