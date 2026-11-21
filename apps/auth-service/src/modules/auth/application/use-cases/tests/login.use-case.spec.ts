import { LoginUseCase } from '../login.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '../../../../../common/ports/password-hasher.port';
import { TokenRepositoryPort } from '../../../../auth/domain/repositories/token.repository.port';
import { TokenServicePort } from '../../../../auth/application/ports/token.service.port';
import { LoginDto } from '../../../../auth/application/dto/login.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockPasswordHasher: jest.Mocked<PasswordHasherPort>;
  let mockTokenRepository: jest.Mocked<TokenRepositoryPort>;
  let mockTokenService: jest.Mocked<TokenServicePort>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    mockPasswordHasher = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as jest.Mocked<PasswordHasherPort>;

    mockTokenRepository = {
      save: jest.fn(),
      findByToken: jest.fn(),
      deleteByUserId: jest.fn(),
      findByUserIdAndType: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TokenRepositoryPort>;

    mockTokenService = {
      generateTokens: jest.fn(),
      verifyRefreshToken: jest.fn(),
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<TokenServicePort>;

    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    useCase = new LoginUseCase(
      mockUserRepository,
      mockPasswordHasher,
      mockTokenRepository,
      mockTokenService,
      mockConfigService,
    );
  });

  describe('execute', () => {
    it('should return access and refresh tokens when credentials are valid', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'hashedPassword',
        '123456789',
        true,
        UserStatus.CONFIRMED,
      );

      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHasher.compare.mockResolvedValue(true);
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);
      mockTokenRepository.deleteByUserId.mockResolvedValue(undefined);
      mockTokenRepository.save.mockResolvedValue(undefined as any);
      mockConfigService.get.mockReturnValue(7);

      const result = await useCase.execute(loginDto);

      expect(result).toEqual(mockTokens);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockPasswordHasher.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(mockTokenService.generateTokens).toHaveBeenCalledWith(mockUser);
      expect(mockTokenRepository.deleteByUserId).toHaveBeenCalledWith(1);
      expect(mockTokenRepository.save).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when user does not exist', async () => {
      const loginDto: LoginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(useCase.execute(loginDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(loginDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'No existe un usuario con el correo indicado',
          }),
        }),
      );

      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('should throw PERMISSION_DENIED when user account is inactive', async () => {
      const loginDto: LoginDto = {
        email: 'inactive@example.com',
        password: 'password123',
      };

      const mockInactiveUser = new User(
        1,
        'John',
        'Doe',
        'inactive@example.com',
        'hashedPassword',
        '123456789',
        false, // inactive
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findByEmail.mockResolvedValue(mockInactiveUser);

      await expect(useCase.execute(loginDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(loginDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.PERMISSION_DENIED,
            message: 'La cuenta de este usuario está inactiva',
          }),
        }),
      );

      expect(mockPasswordHasher.compare).not.toHaveBeenCalled();
      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHENTICATED when password is invalid', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'wrongPassword',
      };

      const mockUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'hashedPassword',
        '123456789',
        true,
        UserStatus.CONFIRMED,
      );

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHasher.compare.mockResolvedValue(false);

      await expect(useCase.execute(loginDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(loginDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'Las credenciales no son válidas',
          }),
        }),
      );

      expect(mockPasswordHasher.compare).toHaveBeenCalledWith('wrongPassword', 'hashedPassword');
      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('should delete existing tokens before creating new ones', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'hashedPassword',
        '123456789',
        true,
        UserStatus.CONFIRMED,
      );

      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHasher.compare.mockResolvedValue(true);
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);
      mockTokenRepository.deleteByUserId.mockResolvedValue(undefined);
      mockTokenRepository.save.mockResolvedValue(undefined as any);
      mockConfigService.get.mockReturnValue(7);

      await useCase.execute(loginDto);

      expect(mockTokenRepository.deleteByUserId).toHaveBeenCalledWith(1);
      expect(mockTokenRepository.save).toHaveBeenCalled();
    });

    it('should store refresh token with correct expiration from config', async () => {
      const loginDto: LoginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'hashedPassword',
        '123456789',
        true,
        UserStatus.CONFIRMED,
      );

      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHasher.compare.mockResolvedValue(true);
      mockTokenService.generateTokens.mockResolvedValue(mockTokens);
      mockTokenRepository.deleteByUserId.mockResolvedValue(undefined);
      mockTokenRepository.save.mockResolvedValue(undefined as any);
      mockConfigService.get.mockReturnValue(14); // 14 days

      await useCase.execute(loginDto);

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'JWT_REFRESH_TOKEN_EXPIRATION_DAYS',
        7,
      );
      expect(mockTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'refresh-token-456',
          userId: 1,
          type: 'REFRESH_TOKEN',
        }),
      );
    });
  });
});
