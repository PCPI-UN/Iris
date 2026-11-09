import { ActivateUserWithMicrosoftUseCase } from '../activate-user-with-microsoft.use-case';
import { UserRepositoryPort } from '../../../domain/repositories/user.repository.port';
import { UserTokenRepositoryPort } from '../../../domain/repositories/user-token.repository.port';
import { User, UserStatus } from '../../../domain/entities/user.entity';
import { RpcException } from '@nestjs/microservices';

const microsoftToken = (claims: Record<string, unknown>): string =>
  [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    'signature',
  ].join('.');

describe('ActivateUserWithMicrosoftUseCase', () => {
  let useCase: ActivateUserWithMicrosoftUseCase;
  let mockUserRepository: jest.Mocked<UserRepositoryPort>;
  let mockUserTokenRepository: jest.Mocked<UserTokenRepositoryPort>;

  const pendingUser = () =>
    new User(
      7,
      'Ana',
      'Pérez',
      'ana.perez@uninorte.edu.co',
      undefined,
      undefined,
      true,
      UserStatus.PENDING,
    );

  beforeEach(() => {
    mockUserRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<UserRepositoryPort>;

    mockUserTokenRepository = {
      markAllAccountSetupTokensAsUsedForUser: jest.fn(),
    } as unknown as jest.Mocked<UserTokenRepositoryPort>;

    useCase = new ActivateUserWithMicrosoftUseCase(
      mockUserRepository,
      mockUserTokenRepository,
    );
  });

  it('activates the invited user when the Microsoft email differs only in case', async () => {
    mockUserRepository.findById.mockResolvedValue(pendingUser());

    const result = await useCase.execute({
      userId: 7,
      token: microsoftToken({ upn: 'Ana.Perez@uninorte.edu.co', oid: 'oid-1' }),
    });

    expect(result).toEqual({ success: true });
    expect(mockUserRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ oid: 'oid-1', status: UserStatus.CONFIRMED }),
    );
    expect(
      mockUserTokenRepository.markAllAccountSetupTokensAsUsedForUser,
    ).toHaveBeenCalledWith(7);
  });

  it('rejects a Microsoft account with a different email', async () => {
    mockUserRepository.findById.mockResolvedValue(pendingUser());

    await expect(
      useCase.execute({
        userId: 7,
        token: microsoftToken({
          upn: 'otra.persona@uninorte.edu.co',
          oid: 'oid-2',
        }),
      }),
    ).rejects.toThrow(RpcException);
    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });
});
