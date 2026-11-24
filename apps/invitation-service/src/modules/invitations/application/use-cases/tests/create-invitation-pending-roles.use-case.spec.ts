import { ConfigService } from '@nestjs/config';
import { CreateInvitationUseCase } from '../create-invitation.use-case';
import { AcceptInvitationUseCase } from '../accept-invitation.use-case';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../../domain/repositories/invitation-role.repository.port';
import {
  Invitation,
  InvitationStatus,
  InvitationTargetType,
} from '../../../domain/entities/invitation.entity';
import { InvitationRole } from '../../../domain/entities/invitation-role.entity';
import { AuthServicePort } from '../../../infrastructure/ports/auth-service.port';
import { EventServicePort } from '../../../infrastructure/ports/event-service.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project-service.port';
import { NotificationServicePort } from '../../../infrastructure/ports/notification-service.port';

const ORGANIZER_ROLE_ID = 3;
const JUROR_ROLE_ID = 4;
const EVENT_ID = 5;
const USER_ID = 200;

/** Invitation roles kept in memory, keyed like the table (invitation_id, role_id) */
class InMemoryInvitationRoles {
  private readonly rows = new Map<string, InvitationRole>();

  save = jest.fn(async (role: InvitationRole) => {
    this.rows.set(`${role.invitationId}:${role.roleId}`, role);
    return role;
  });

  findByInvitationId = jest.fn(async (invitationId: string) =>
    [...this.rows.values()].filter((role) => role.invitationId === invitationId),
  );
}

describe('CreateInvitation reusing a pending invitation with other roles', () => {
  let pending: Invitation;
  let roles: InMemoryInvitationRoles;
  let invitationRepository: Record<string, jest.Mock>;
  let eventService: Record<string, jest.Mock>;
  let notificationService: Record<string, jest.Mock>;
  let createInvitation: CreateInvitationUseCase;
  let acceptInvitation: AcceptInvitationUseCase;

  beforeEach(async () => {
    pending = new Invitation(
      'inv-1',
      'token-1',
      'ana@unal.edu.co',
      InvitationTargetType.EVENT,
      EVENT_ID,
      InvitationStatus.PENDING,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      1,
      USER_ID,
      new Date(),
      new Date(),
    );
    roles = new InMemoryInvitationRoles();
    await roles.save(new InvitationRole(pending.id, ORGANIZER_ROLE_ID));
    roles.save.mockClear();

    invitationRepository = {
      findAcceptedByEmailAndTargetType: jest.fn().mockResolvedValue(null),
      findPendingByEmailAndTargetType: jest.fn().mockResolvedValue(pending),
      findByToken: jest.fn().mockResolvedValue(pending),
      save: jest.fn(async (invitation: Invitation) => invitation),
    };
    eventService = {
      getEvent: jest.fn(),
      createEventMember: jest.fn().mockResolvedValue({}),
    };
    notificationService = {
      sendJurorInvitationEmail: jest.fn(),
      sendPlatformInvitationEmail: jest.fn(),
      sendProjectSubmittedInvitationEmail: jest.fn(),
      sendProjectTutorInvitationEmail: jest.fn(),
    };
    const authService = {
      getUser: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      getUserByEmail: jest.fn(),
      createBasicUser: jest.fn(),
    };

    createInvitation = new CreateInvitationUseCase(
      invitationRepository as unknown as InvitationRepositoryPort,
      roles as unknown as InvitationRoleRepositoryPort,
      authService as unknown as AuthServicePort,
      eventService as unknown as EventServicePort,
      {} as ProjectServicePort,
      notificationService as unknown as NotificationServicePort,
      { get: jest.fn() } as unknown as ConfigService,
    );
    acceptInvitation = new AcceptInvitationUseCase(
      invitationRepository as unknown as InvitationRepositoryPort,
      roles as unknown as InvitationRoleRepositoryPort,
      authService as unknown as AuthServicePort,
      eventService as unknown as EventServicePort,
      {} as ProjectServicePort,
    );
  });

  const inviteAsJuror = () =>
    createInvitation.execute({
      email: 'Ana@unal.edu.co',
      eventType: 'Exposition',
      targetType: InvitationTargetType.EVENT,
      targetId: EVENT_ID,
      invitedByUserId: 1,
      roleIds: [JUROR_ROLE_ID],
    });

  it('adds the missing role to the pending invitation and keeps the ones it had', async () => {
    const result = await inviteAsJuror();

    expect(result.invitation).toBe(pending);
    expect(result.invitationRoles.map((role) => role.roleId)).toEqual([
      ORGANIZER_ROLE_ID,
      JUROR_ROLE_ID,
    ]);
    expect(roles.save).toHaveBeenCalledTimes(1);
    expect(roles.save).toHaveBeenCalledWith(
      new InvitationRole(pending.id, JUROR_ROLE_ID),
    );
    // Same invitation: no new record, token or email
    expect(invitationRepository.save).not.toHaveBeenCalled();
    expect(eventService.getEvent).not.toHaveBeenCalled();
    expect(notificationService.sendJurorInvitationEmail).not.toHaveBeenCalled();
  });

  it('assigns both roles when the reused invitation is accepted', async () => {
    await inviteAsJuror();

    await expect(
      acceptInvitation.execute({ token: pending.token }),
    ).resolves.toEqual({ success: true });

    expect(eventService.createEventMember).toHaveBeenCalledTimes(2);
    expect(eventService.createEventMember).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      userId: USER_ID,
      roleId: ORGANIZER_ROLE_ID,
    });
    expect(eventService.createEventMember).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      userId: USER_ID,
      roleId: JUROR_ROLE_ID,
    });
  });

  it('changes nothing when the pending invitation already has every requested role', async () => {
    await roles.save(new InvitationRole(pending.id, JUROR_ROLE_ID));
    roles.save.mockClear();

    const result = await createInvitation.execute({
      email: 'ana@unal.edu.co',
      eventType: 'Exposition',
      targetType: InvitationTargetType.EVENT,
      targetId: EVENT_ID,
      invitedByUserId: 1,
      roleIds: [JUROR_ROLE_ID, ORGANIZER_ROLE_ID, JUROR_ROLE_ID],
    });

    expect(result.invitationRoles.map((role) => role.roleId)).toEqual([
      ORGANIZER_ROLE_ID,
      JUROR_ROLE_ID,
    ]);
    expect(roles.save).not.toHaveBeenCalled();
    expect(invitationRepository.save).not.toHaveBeenCalled();
    expect(notificationService.sendJurorInvitationEmail).not.toHaveBeenCalled();
  });
});
