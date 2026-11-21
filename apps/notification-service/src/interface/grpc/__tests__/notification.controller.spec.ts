import {
  EmailDeliveryStatus,
  EmailTemplate,
} from '@app/common/generated/notification';
import { NotificationController } from '../notification.controller';
import { SendEmailUseCase } from '../../../application/use-cases/send-email.use-case';
import { GetEmailStatusUseCase } from '../../../application/use-cases/get-email-status.use-case';
import { buildDelivery } from '../../../application/use-cases/__tests__/delivery.fixture';

describe('NotificationController', () => {
  const request = {
    to: 'laura@test.local',
    template: EmailTemplate.PLATFORM_INVITATION,
    params: {},
  };

  const build = (status: 'PENDING' | 'SENT' | 'FAILED') => {
    const execute = jest
      .fn()
      .mockResolvedValue(buildDelivery({ status, attempts: 1 }));
    const getStatus = jest.fn().mockResolvedValue([buildDelivery()]);
    return new NotificationController(
      { execute } as unknown as SendEmailUseCase,
      { execute: getStatus } as unknown as GetEmailStatusUseCase,
    );
  };

  it.each([
    ['SENT', true],
    ['PENDING', true],
    ['FAILED', false],
  ] as const)('a %s delivery answers success=%p', async (status, success) => {
    const response = await build(status).sendEmail(request);

    expect(response.success).toBe(success);
    expect(response.delivery?.status).toBe(EmailDeliveryStatus[status]);
  });

  it('maps the delivery to the proto message', async () => {
    const response = await build('PENDING').getEmailStatus({
      ids: ['d-1'],
      idempotencyKeys: [],
    });

    expect(response.deliveries).toEqual([
      {
        id: 'd-1',
        idempotencyKey: 'invitation:abc:1700000000000',
        to: 'laura@test.local',
        template: EmailTemplate.PLATFORM_INVITATION,
        status: EmailDeliveryStatus.PENDING,
        provider: undefined,
        attempts: 0,
        lastError: undefined,
        createdAt: '2026-11-08T10:00:00.000Z',
        updatedAt: '2026-11-08T10:00:00.000Z',
        sentAt: undefined,
        nextAttemptAt: '2026-11-08T10:05:00.000Z',
      },
    ]);
  });
});
