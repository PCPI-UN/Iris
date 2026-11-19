import { ValidateTokenUseCase } from '../validate-token.use-case';
import { UserTokenRepositoryPort } from '../../../../users/domain/repositories/user-token.repository.port';
import { UserToken, UserTokenType } from '../../../../users/domain/entities/user-token.entity';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('ValidateTokenUseCase', () => {
  let useCase: ValidateTokenUseCase;
  let mockUserTokenRepository: jest.Mocked<UserTokenRepositoryPort>;

  beforeEach(() => {
    mockUserTokenRepository = {
      findByToken: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<UserTokenRepositoryPort>;

    useCase = new ValidateTokenUseCase(mockUserTokenRepository);
  });

  describe('execute', () => {
    it('should return valid true and userId when token is valid', async () => {
      const token = 'valid-token-123';
      const mockUserToken = new UserToken(
        'token-id',
        token,
        1, // userId
        UserTokenType.ACCOUNT_SETUP,
        new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
        null, // Not used yet
      );

      mockUserTokenRepository.findByToken.mockResolvedValue(mockUserToken);

      const result = await useCase.execute(token);

      expect(result).toEqual({
        valid: true,
        userId: 1,
        tokenType: UserTokenType.ACCOUNT_SETUP,
      });
      expect(mockUserTokenRepository.findByToken).toHaveBeenCalledWith(token);
    });

    it('should throw NOT_FOUND when token does not exist', async () => {
      const token = 'non-existent-token';

      mockUserTokenRepository.findByToken.mockResolvedValue(null);

      await expect(useCase.execute(token)).rejects.toThrow(RpcException);
      await expect(useCase.execute(token)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'El enlace no existe, expiró o ya se usó',
          }),
        }),
      );
    });

    it('should throw NOT_FOUND, without saying why, when token has already been used', async () => {
      const token = 'used-token';
      const mockUserToken = new UserToken(
        'token-id',
        token,
        1,
        UserTokenType.ACCOUNT_SETUP,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
        new Date(), // Already used
      );

      mockUserTokenRepository.findByToken.mockResolvedValue(mockUserToken);

      await expect(useCase.execute(token)).rejects.toThrow(RpcException);
      await expect(useCase.execute(token)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'El enlace no existe, expiró o ya se usó',
          }),
        }),
      );
    });

    it('should throw NOT_FOUND, without saying why, when token has expired', async () => {
      const token = 'expired-token';
      const mockUserToken = new UserToken(
        'token-id',
        token,
        1,
        UserTokenType.ACCOUNT_SETUP,
        new Date(Date.now() - 1000), // Expired 1 second ago
        null,
      );

      mockUserTokenRepository.findByToken.mockResolvedValue(mockUserToken);

      await expect(useCase.execute(token)).rejects.toThrow(RpcException);
      await expect(useCase.execute(token)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.NOT_FOUND,
            message: 'El enlace no existe, expiró o ya se usó',
          }),
        }),
      );
    });
  });
});
