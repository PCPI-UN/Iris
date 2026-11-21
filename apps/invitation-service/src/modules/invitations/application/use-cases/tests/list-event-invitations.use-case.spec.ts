import { ListEventInvitationsUseCase } from '../list-event-invitations.use-case';
import { InvitationRepositoryPort } from '../../../domain/repositories/invitation.repository.port';
import { InvitationRoleRepositoryPort } from '../../../domain/repositories/invitation-role.repository.port';
import { Invitation } from '../../../domain/entities/invitation.entity';
import {
  EmailStatus,
  NotificationServicePort,
  invitationEmailKey,
} from '../../../infrastructure/ports/notification-service.port';

describe('ListEventInvitationsUseCase - email status', () => {
  const dto = { eventId: 3, page: 1, limit: 10 };
  const invitation = (id: string, expiresAt: Date) =>
    ({ id, expiresAt }) as unknown as Invitation;

  const inv1 = invitation('inv-1', new Date('2026-12-01T00:00:00Z'));
  const inv2 = invitation('inv-2', new Date('2026-12-02T00:00:00Z'));

  let invitationRepository: { findByEventId: jest.Mock };
  let notificationService: { getEmailStatuses: jest.Mock };
  let useCase: ListEventInvitationsUseCase;

  beforeEach(() => {
    invitationRepository = {
      findByEventId: jest
        .fn()
        .mockResolvedValue({ invitations: [inv1, inv2], total: 2 }),
    };
    const roleRepository = {
      findByInvitationIds: jest.fn().mockResolvedValue([]),
    };
    notificationService = { getEmailStatuses: jest.fn() };
    useCase = new ListEventInvitationsUseCase(
      invitationRepository as unknown as InvitationRepositoryPort,
      roleRepository as unknown as InvitationRoleRepositoryPort,
      notificationService as unknown as NotificationServicePort,
    );
  });

  it('assigns each status to its invitation with a single call', async () => {
    const key1 = invitationEmailKey(inv1.id, inv1.expiresAt);
    const key2 = invitationEmailKey(inv2.id, inv2.expiresAt);
    notificationService.getEmailStatuses.mockResolvedValue(
      new Map<string, EmailStatus>([
        [key1, 'SENT'],
        [key2, 'FAILED'],
      ]),
    );

    const { emailStatuses } = await useCase.execute(dto);

    expect(notificationService.getEmailStatuses).toHaveBeenCalledTimes(1);
    expect(notificationService.getEmailStatuses).toHaveBeenCalledWith([
      key1,
      key2,
    ]);
    expect(emailStatuses.get('inv-1')).toBe('SENT');
    expect(emailStatuses.get('inv-2')).toBe('FAILED');
  });

  it('leaves out invitations without a recorded delivery', async () => {
    const key1 = invitationEmailKey(inv1.id, inv1.expiresAt);
    notificationService.getEmailStatuses.mockResolvedValue(
      new Map<string, EmailStatus>([[key1, 'PENDING']]),
    );

    const { emailStatuses } = await useCase.execute(dto);

    expect(emailStatuses.get('inv-1')).toBe('PENDING');
    expect(emailStatuses.has('inv-2')).toBe(false);
  });

  it('returns the list without statuses when notification-service fails', async () => {
    notificationService.getEmailStatuses.mockRejectedValue(
      new Error('unavailable'),
    );

    const result = await useCase.execute(dto);

    expect(result.invitations).toEqual([inv1, inv2]);
    expect(result.total).toBe(2);
    expect(result.emailStatuses.size).toBe(0);
  });

  it('does not call notification-service for an empty page', async () => {
    invitationRepository.findByEventId.mockResolvedValue({
      invitations: [],
      total: 0,
    });

    const result = await useCase.execute(dto);

    expect(notificationService.getEmailStatuses).not.toHaveBeenCalled();
    expect(result.emailStatuses.size).toBe(0);
  });
});
