import { ConfigService } from '@nestjs/config';
import { status } from '@grpc/grpc-js';
import { CreateInvitationUseCase } from '../create-invitation.use-case';
import { CreateInvitationDto } from '../../dto/create-invitation.dto';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../../domain/repositories/invitation-role.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';
import { AuthServicePort } from '../../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../../infrastructure/ports/event-service.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project-service.port';
import { NotificationServicePort } from '../../../infrastructure/ports/notification-service.port';

describe('CreateInvitationUseCase - email normalization', () => {
  const normalized = 'ana.perez@uninorte.edu.co';

  let useCase: CreateInvitationUseCase;
  let invitationRepository: jest.Mocked<InvitationRepositoryPort>;
  let authService: jest.Mocked<AuthServicePort>;
  let notificationService: jest.Mocked<NotificationServicePort>;

  const dto = (): CreateInvitationDto => ({
    email: '  Ana.Perez@Uninorte.edu.co ',
    eventType: 'Exposition',
    targetType: InvitationTargetType.EVENT,
    targetId: 3,
    invitedByUserId: 1,
    roleIds: [4],
  });

  beforeEach(() => {
    invitationRepository = {
      findAcceptedByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      findPendingByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      save: jest.fn((invitation: Invitation) => Promise.resolve(invitation)),
    } as unknown as jest.Mocked<InvitationRepositoryPort>;

    const invitationRoleRepository = {
      findByInvitationId: jest.fn().mockResolvedValue([]),
      save: jest.fn((role) => Promise.resolve(role)),
    } as unknown as jest.Mocked<InvitationRoleRepositoryPort>;

    authService = {
      getUserByEmail: jest.fn().mockRejectedValue({ code: status.NOT_FOUND }),
      createBasicUser: jest.fn().mockResolvedValue({
        id: 9,
        email: normalized,
        firstName: 'ana.perez',
        status: 'PENDING',
      }),
      generateAccountSetupToken: jest
        .fn()
        .mockResolvedValue({ token: 'setup-token', expiresAt: new Date() }),
    } as unknown as jest.Mocked<AuthServicePort>;

    const eventService = {
      getEvent: jest.fn().mockResolvedValue({ name: 'Feria', description: '' }),
    } as unknown as jest.Mocked<EventServicePort>;

    notificationService = {
      sendJurorInvitationEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationServicePort>;

    const configService = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;

    useCase = new CreateInvitationUseCase(
      invitationRepository,
      invitationRoleRepository,
      authService,
      eventService,
      {} as ProjectServicePort,
      notificationService,
      configService,
    );
  });

  it('looks up, creates and stores the invitation with the normalized email', async () => {
    const { invitation } = await useCase.execute(dto());

    expect(
      invitationRepository.findAcceptedByEmailAndTargetType,
    ).toHaveBeenCalledWith(normalized, InvitationTargetType.EVENT, 3);
    expect(
      invitationRepository.findPendingByEmailAndTargetType,
    ).toHaveBeenCalledWith(normalized, InvitationTargetType.EVENT, 3);
    expect(authService.getUserByEmail).toHaveBeenCalledWith(normalized);
    expect(authService.createBasicUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: normalized, firstName: 'ana.perez' }),
    );
    expect(invitation.email).toBe(normalized);
    expect(notificationService.sendJurorInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: normalized }),
    );
  });

  it('sends the email with an idempotency key built from the invitation id and expiry', async () => {
    const { invitation } = await useCase.execute(dto());

    expect(notificationService.sendJurorInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `invitation:${invitation.id}:${invitation.expiresAt.getTime()}`,
      }),
    );
  });

  it('returns the pending invitation of the same email without sending another one', async () => {
    const pending = new Invitation(
      'inv-1',
      'token-1',
      normalized,
      InvitationTargetType.EVENT,
      3,
      InvitationStatus.PENDING,
      new Date(),
      1,
      9,
      new Date(),
      new Date(),
    );
    invitationRepository.findPendingByEmailAndTargetType.mockResolvedValue(
      pending,
    );

    const { invitation } = await useCase.execute(dto());

    expect(invitation).toBe(pending);
    expect(invitationRepository.save).not.toHaveBeenCalled();
    expect(notificationService.sendJurorInvitationEmail).not.toHaveBeenCalled();
  });
});
