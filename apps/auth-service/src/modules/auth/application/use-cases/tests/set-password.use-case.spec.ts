import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { SetPasswordUseCase } from '../set-password.use-case';
import { ValidateTokenUseCase } from '../validate-token.use-case';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { UserTokenRepositoryPort } from '@users/domain/repositories/user-token.repository.port';
import { UserTokenType } from '@users/domain/entities/user-token.entity';
import { User, UserStatus } from '@users/domain/entities/user.entity';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { TokenRepositoryPort } from '@auth/domain/repositories/token.repository.port';

describe('SetPasswordUseCase', () => {
  let validateToken: { execute: jest.Mock };
  let userRepository: { findById: jest.Mock; save: jest.Mock };
  let passwordHasher: { hash: jest.Mock };
  let userTokenRepository: { markAsUsed: jest.Mock };
  let tokenRepository: { deleteByUserId: jest.Mock };
  let useCase: SetPasswordUseCase;

  const pendingUser = () =>
    new User(
      1,
      'John',
      'Doe',
      'john@example.com',
      undefined,
      undefined,
      true,
      UserStatus.PENDING,
    );

  beforeEach(() => {
    validateToken = { execute: jest.fn() };
    userRepository = {
      findById: jest.fn(),
      save: jest.fn(async (user) => user),
    };
    passwordHasher = { hash: jest.fn().mockResolvedValue('hashed-password') };
    userTokenRepository = { markAsUsed: jest.fn() };
    tokenRepository = { deleteByUserId: jest.fn() };

    useCase = new SetPasswordUseCase(
      validateToken as unknown as ValidateTokenUseCase,
      userRepository as unknown as UserRepositoryPort,
      passwordHasher as unknown as PasswordHasherPort,
      userTokenRepository as unknown as UserTokenRepositoryPort,
      tokenRepository as unknown as TokenRepositoryPort,
    );
  });

  it('sets the password of a new account, confirms it and marks the link as used', async () => {
    validateToken.execute.mockResolvedValue({
      valid: true,
      userId: 1,
      tokenType: UserTokenType.ACCOUNT_SETUP,
    });
    userRepository.findById.mockResolvedValue(pendingUser());

    await expect(
      useCase.execute({ token: 'setup-token', password: 'NewPassword123!' }),
    ).resolves.toEqual({
      success: true,
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('NewPassword123!');
    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'hashed-password',
        status: UserStatus.CONFIRMED,
      }),
    );
    expect(userTokenRepository.markAsUsed).toHaveBeenCalledWith('setup-token');
    // Setting up an account does not close sessions
    expect(tokenRepository.deleteByUserId).not.toHaveBeenCalled();
  });

  it('on a password reset keeps the account status and closes the sessions of the user', async () => {
    validateToken.execute.mockResolvedValue({
      valid: true,
      userId: 1,
      tokenType: UserTokenType.RESET_PASSWORD,
    });
    userRepository.findById.mockResolvedValue(pendingUser());

    await useCase.execute({
      token: 'reset-token',
      password: 'NewPassword123!',
    });

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'hashed-password',
        status: UserStatus.PENDING,
      }),
    );
    expect(userTokenRepository.markAsUsed).toHaveBeenCalledWith('reset-token');
    expect(tokenRepository.deleteByUserId).toHaveBeenCalledWith(1);
  });

  it('answers NOT_FOUND when the user of the link does not exist', async () => {
    validateToken.execute.mockResolvedValue({
      valid: true,
      userId: 999,
      tokenType: UserTokenType.ACCOUNT_SETUP,
    });
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'setup-token', password: 'NewPassword123!' }),
    ).rejects.toThrow(
      expect.objectContaining({
        error: expect.objectContaining({
          code: status.NOT_FOUND,
          message: 'No se encontró el usuario',
        }),
      }),
    );
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(userTokenRepository.markAsUsed).not.toHaveBeenCalled();
  });

  it('changes nothing when the link is not valid', async () => {
    validateToken.execute.mockRejectedValue(
      new RpcException({
        code: status.NOT_FOUND,
        message: 'El enlace no existe, expiró o ya se usó',
      }),
    );

    await expect(
      useCase.execute({ token: 'bad-token', password: 'NewPassword123!' }),
    ).rejects.toThrow(RpcException);
    expect(userRepository.findById).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
    expect(userTokenRepository.markAsUsed).not.toHaveBeenCalled();
  });
});
