import { GetUsersUseCase } from '../get-users.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { GetUsersDto } from '../../../../users/application/dto/get-users.dto';
import {
  User,
  UserStatus,
} from '../../../../users/domain/entities/user.entity';
import { Role } from '@roles/domain/entities/role.entity';

describe('GetUsersUseCase', () => {
  let useCase: GetUsersUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;

  beforeEach(() => {
    mockUserRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    useCase = new GetUsersUseCase(mockUserRepository);
  });

  describe('execute', () => {
    it('should return paginated users with metadata', async () => {
      const getUsersDto: GetUsersDto = {
        page: 1,
        limit: 10,
        includeInactive: false,
      };

      const mockUsers = [
        {
          user: new User(
            1,
            'John',
            'Doe',
            'john@example.com',
            'pass',
            '123',
            true,
            UserStatus.CONFIRMED,
          ),
          roles: [new Role(1, 'Admin', 'Administrator', 'PLATFORM')],
        },
        {
          user: new User(
            2,
            'Jane',
            'Smith',
            'jane@example.com',
            'pass',
            '456',
            true,
            UserStatus.CONFIRMED,
          ),
          roles: [],
        },
      ];

      mockUserRepository.findAll.mockResolvedValue({
        users: mockUsers,
        total: 25,
      });

      const result = await useCase.execute(getUsersDto);

      expect(result).toEqual({
        data: mockUsers,
        meta: {
          totalItems: 25,
          itemsOnPage: 2,
          itemsPerPage: 10,
          totalPages: 3,
          currentPage: 1,
        },
      });
      expect(mockUserRepository.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        includeInactive: false,
      });
    });

    it('should use default values when page and limit are not provided', async () => {
      const getUsersDto: GetUsersDto = {};

      mockUserRepository.findAll.mockResolvedValue({
        users: [],
        total: 0,
      });

      await useCase.execute(getUsersDto);

      expect(mockUserRepository.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        includeInactive: false,
      });
    });

    it('should include inactive users when includeInactive is true', async () => {
      const getUsersDto: GetUsersDto = {
        page: 1,
        limit: 10,
        includeInactive: true,
      };

      const mockUsers = [
        {
          user: new User(
            1,
            'John',
            'Doe',
            'john@example.com',
            'pass',
            '123',
            true,
            UserStatus.CONFIRMED,
          ),
          roles: [],
        },
        {
          user: new User(
            2,
            'Jane',
            'Smith',
            'jane@example.com',
            'pass',
            '456',
            false,
            UserStatus.CONFIRMED,
          ), // inactive
          roles: [],
        },
      ];

      mockUserRepository.findAll.mockResolvedValue({
        users: mockUsers,
        total: 2,
      });

      const result = await useCase.execute(getUsersDto);

      expect(result.data).toEqual(mockUsers);
      expect(mockUserRepository.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        includeInactive: true,
      });
    });
  });
});
