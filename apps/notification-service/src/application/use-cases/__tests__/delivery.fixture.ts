import { EmailDelivery } from '../../../domain/email-delivery';

export const buildDelivery = (
  overrides: Partial<EmailDelivery> = {},
): EmailDelivery => ({
  id: 'd-1',
  idempotencyKey: 'invitation:abc:1700000000000',
  recipient: 'laura@test.local',
  template: 'PLATFORM_INVITATION',
  params: { firstName: 'Laura', invitationLink: 'https://iris.test/x' },
  status: 'PENDING',
  provider: null,
  attempts: 0,
  lastError: null,
  nextAttemptAt: new Date('2026-11-08T10:05:00Z'),
  sentAt: null,
  createdAt: new Date('2026-11-08T10:00:00Z'),
  updatedAt: new Date('2026-11-08T10:00:00Z'),
  ...overrides,
});
