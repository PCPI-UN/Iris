import { status } from '@grpc/grpc-js';
import { GetInvitationByTokenUseCase } from '../get-invitation-by-token.use-case';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../../domain/repositories/invitation-role.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';
import { InvitationRole } from '../../../domain/entities/invitation-role.entity';
import { AuthServicePort } from '../../../infrastructure/ports/auth-service.port';

describe('GetInvitationByTokenUseCase', () => {
  let useCase: GetInvitationByTokenUseCase;
  let invitationRepository: { findByToken: jest.Mock };
  let invitationRoleRepository: { findByInvitationId: jest.Mock };
  let authService: { getUser: jest.Mock };

  const DAY = 24 * 60 * 60 * 1000;
  const invitation = (
    overrides: {
      status?: InvitationStatus;
      expiresAt?: Date;
      invitedUserId?: number | null;
    } = {},
  ) =>
    new Invitation(
      'inv-1',
      'token-123',
      'ana@uninorte.edu.co',
      InvitationTargetType.EVENT,
      3,
      overrides.status ?? InvitationStatus.PENDING,
      overrides.expiresAt ?? new Date(Date.now() + DAY),
      1,
      overrides.invitedUserId === undefined
        ? 7
        : (overrides.invitedUserId as number),
      new Date(),
      new Date(),
    );

  const rpcError = (code: number, message: string) =>
    expect.objectContaining({
      error: expect.objectContaining({ code, message }),
    });

  beforeEach(() => {
    invitationRepository = { findByToken: jest.fn() };
    invitationRoleRepository = {
      findByInvitationId: jest
        .fn()
        .mockResolvedValue([
          new InvitationRole('inv-1', 4),
          new InvitationRole('inv-1', 5),
        ]),
    };
    authService = {
      getUser: jest.fn().mockResolvedValue({
        id: 7,
        email: 'ana@uninorte.edu.co',
        firstName: 'Ana',
        lastName: 'Pérez',
        status: 'PENDING',
      }),
    };

    useCase = new GetInvitationByTokenUseCase(
      invitationRepository as unknown as InvitationRepositoryPort,
      invitationRoleRepository as unknown as InvitationRoleRepositoryPort,
      authService as unknown as AuthServicePort,
    );
  });

  it('returns the invited user and the roles of a pending invitation', async () => {
    invitationRepository.findByToken.mockResolvedValue(invitation());

    await expect(useCase.execute({ token: 'token-123' })).resolves.toEqual({
      email: 'ana@uninorte.edu.co',
      userStatus: 'PENDING',
      firstName: 'Ana',
      lastName: 'Pérez',
      roleIds: [4, 5],
    });
    expect(invitationRepository.findByToken).toHaveBeenCalledWith('token-123');
    expect(authService.getUser).toHaveBeenCalledWith(7);
    expect(invitationRoleRepository.findByInvitationId).toHaveBeenCalledWith(
      'inv-1',
    );
  });

  it.each([
    ['does not exist', null],
    ['expired', invitation({ expiresAt: new Date(Date.now() - DAY) })],
    ['already accepted', invitation({ status: InvitationStatus.ACCEPTED })],
  ])('answers NOT_FOUND when the invitation %s', async (_case, found) => {
    invitationRepository.findByToken.mockResolvedValue(found);

    await expect(useCase.execute({ token: 'token-123' })).rejects.toEqual(
      rpcError(status.NOT_FOUND, 'No se encontró la invitación o no es válida'),
    );
    expect(authService.getUser).not.toHaveBeenCalled();
  });

  it('answers FAILED_PRECONDITION when the invitation has no invited user', async () => {
    invitationRepository.findByToken.mockResolvedValue(
      invitation({ invitedUserId: null }),
    );

    await expect(useCase.execute({ token: 'token-123' })).rejects.toEqual(
      rpcError(
        status.FAILED_PRECONDITION,
        'La invitación no tiene un usuario válido.',
      ),
    );
    expect(authService.getUser).not.toHaveBeenCalled();
  });
});
