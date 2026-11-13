import { RefreshUseCase } from '../refresh.use-case';
import { UserRepositoryPort } from '../../../../users/domain/repositories/user.repository.port';
import { TokenRepositoryPort } from '../../../../auth/domain/repositories/token.repository.port';
import { TokenServicePort } from '../../../../auth/application/ports/token.service.port';
import { RefreshDto } from '../../../../auth/application/dto/refresh.dto';
import { User, UserStatus } from '../../../../users/domain/entities/user.entity';
import { Token, TokenType } from '../../../../auth/domain/entities/token.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('RefreshUseCase', () => {
  let useCase: RefreshUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockTokenRepository: jest.Mocked<TokenRepositoryPort>;
  let mockTokenService: jest.Mocked<TokenServicePort>;

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
      existsByEmail: jest.fn(),
      existsByPhone: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    mockTokenRepository = {
      findByToken: jest.fn(),
      save: jest.fn(),
      deleteByUserId: jest.fn(),
      findByUserIdAndType: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<TokenRepositoryPort>;

    mockTokenService = {
      generateTokens: jest.fn(),
      verifyRefreshToken: jest.fn(),
      verifyAccessToken: jest.fn(),
    } as unknown as jest.Mocked<TokenServicePort>;

    useCase = new RefreshUseCase(
      mockUserRepository,
      mockTokenRepository,
      mockTokenService,
    );
  });

  describe('execute', () => {
    it('should return new access token when refresh token is valid', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'valid-refresh-token',
      };

      const storedToken = new Token(
        'token-id',
        'valid-refresh-token',
        1,
        TokenType.REFRESH_TOKEN,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        null,
      );

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

      mockTokenRepository.findByToken.mockResolvedValue(storedToken);
      mockTokenService.verifyRefreshToken.mockResolvedValue({ userId: 1 });
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockTokenService.generateTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const result = await useCase.execute(refreshDto);

      expect(result).toEqual({ accessToken: 'new-access-token' });
      expect(mockTokenRepository.findByToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockTokenService.verifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
      expect(mockTokenService.generateTokens).toHaveBeenCalledWith(mockUser);
    });

    it('should throw UNAUTHENTICATED when refresh token is not found', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'non-existent-token',
      };

      mockTokenRepository.findByToken.mockResolvedValue(null);

      await expect(useCase.execute(refreshDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(refreshDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'La sesión no es válida o expiró; inicia sesión de nuevo',
          }),
        }),
      );

      expect(mockTokenService.verifyRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHENTICATED when refresh token is expired', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'expired-token',
      };

      const expiredToken = new Token(
        'token-id',
        'expired-token',
        1,
        TokenType.REFRESH_TOKEN,
        new Date(Date.now() - 1000), // Expired 1 second ago
        null,
      );

      mockTokenRepository.findByToken.mockResolvedValue(expiredToken);

      await expect(useCase.execute(refreshDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(refreshDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'La sesión no es válida o expiró; inicia sesión de nuevo',
          }),
        }),
      );

      expect(mockTokenService.verifyRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHENTICATED when refresh token has already been used', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'used-token',
      };

      const usedToken = new Token(
        'token-id',
        'used-token',
        1,
        TokenType.REFRESH_TOKEN,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        new Date(), // Already used
      );

      mockTokenRepository.findByToken.mockResolvedValue(usedToken);

      await expect(useCase.execute(refreshDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(refreshDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'La sesión no es válida o expiró; inicia sesión de nuevo',
          }),
        }),
      );

      expect(mockTokenService.verifyRefreshToken).not.toHaveBeenCalled();
    });

    it('should throw PERMISSION_DENIED when user is inactive', async () => {
      const refreshDto: RefreshDto = {
        refreshToken: 'valid-refresh-token',
      };

      const storedToken = new Token(
        'token-id',
        'valid-refresh-token',
        1,
        TokenType.REFRESH_TOKEN,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        null,
      );

      const inactiveUser = new User(
        1,
        'John',
        'Doe',
        'test@example.com',
        'hashedPassword',
        '123456789',
        false, // Inactive
        UserStatus.CONFIRMED,
      );

      mockTokenRepository.findByToken.mockResolvedValue(storedToken);
      mockTokenService.verifyRefreshToken.mockResolvedValue({ userId: 1 });
      mockUserRepository.findById.mockResolvedValue(inactiveUser);

      await expect(useCase.execute(refreshDto)).rejects.toThrow(RpcException);
      await expect(useCase.execute(refreshDto)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.PERMISSION_DENIED,
            message: 'No se encontró el usuario o la cuenta está inactiva',
          }),
        }),
      );

      expect(mockTokenService.generateTokens).not.toHaveBeenCalled();
    });
  });
});
