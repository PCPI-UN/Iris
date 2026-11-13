import { ValidateJwtUseCase } from '../validate-jwt.use-case';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';

describe('ValidateJwtUseCase', () => {
  let useCase: ValidateJwtUseCase;
  let mockJwtService: jest.Mocked<JwtService>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockJwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue(Buffer.from('test-public-key').toString('base64')),
    } as unknown as jest.Mocked<ConfigService>;

    useCase = new ValidateJwtUseCase(mockJwtService, mockConfigService);
  });

  describe('execute', () => {
    it('should return valid true and userId when token is valid', async () => {
      const token = 'valid-jwt-token';
      const decodedPayload = { sub: 123, email: 'test@example.com' };

      mockJwtService.verifyAsync.mockResolvedValue(decodedPayload);

      const result = await useCase.execute(token);

      expect(result).toEqual({
        valid: true,
        userId: 123,
      });
      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(token, {
        secret: expect.any(String),
        algorithms: ['RS256'],
      });
    });

    it('should throw UNAUTHENTICATED when token is invalid', async () => {
      const token = 'invalid-jwt-token';

      mockJwtService.verifyAsync.mockRejectedValue(
        Object.assign(new Error('invalid signature'), { name: 'JsonWebTokenError' }),
      );

      await expect(useCase.execute(token)).rejects.toThrow(RpcException);
      await expect(useCase.execute(token)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'El token no es válido',
          }),
        }),
      );
    });

    it('should throw UNAUTHENTICATED when token is expired', async () => {
      const token = 'expired-jwt-token';

      mockJwtService.verifyAsync.mockRejectedValue(Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }));

      await expect(useCase.execute(token)).rejects.toThrow(RpcException);
      await expect(useCase.execute(token)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'La sesión expiró; inicia sesión de nuevo',
          }),
        }),
      );
    });

    it('should throw error when token payload is missing sub (userId)', async () => {
      const token = 'token-without-sub';
      const decodedPayload = { email: 'test@example.com' }; // Missing 'sub'

      mockJwtService.verifyAsync.mockResolvedValue(decodedPayload);

      await expect(useCase.execute(token)).rejects.toThrow(RpcException);
      await expect(useCase.execute(token)).rejects.toThrow(
        expect.objectContaining({
          error: expect.objectContaining({
            code: status.UNAUTHENTICATED,
            message: 'El token no incluye el ID del usuario',
          }),
        }),
      );
    });
  });
});
