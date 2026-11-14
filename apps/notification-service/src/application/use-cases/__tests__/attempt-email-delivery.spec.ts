import { EmailTemplate } from '@app/common/generated/notification';
import {
  AttemptEmailDelivery,
  SENT_WRITE_RETRY_DELAYS_MS,
} from '../attempt-email-delivery';
import { EmailDelivery } from '../../../domain/email-delivery';
import { buildDelivery } from './delivery.fixture';
import { EmailDeliveryRepositoryPort } from '../../ports/email-delivery.repository.port';
import {
  EmailSendError,
  EmailServicePort,
} from '../../ports/email.service.port';

describe('AttemptEmailDelivery', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const policy = { maxAttempts: 3, baseDelayMs: 60_000 };

  const build = (sendEmail: jest.Mock) => {
    const update = jest.fn(
      (id: string, data: Partial<EmailDelivery>): Promise<EmailDelivery> =>
        Promise.resolve(buildDelivery({ id, ...data })),
    );
    const attempt = new AttemptEmailDelivery(
      { update } as unknown as EmailDeliveryRepositoryPort,
      { sendEmail } as unknown as EmailServicePort,
      policy,
    );
    return { attempt, update };
  };

  it('sends with the stored template and params and records SENT', async () => {
    const sendEmail = jest.fn().mockResolvedValue({ provider: 'acs' });
    const { attempt, update } = build(sendEmail);

    const result = await attempt.execute(buildDelivery(), () => now);

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'laura@test.local',
      template: EmailTemplate.PLATFORM_INVITATION,
      params: { firstName: 'Laura', invitationLink: 'https://iris.test/x' },
    });
    expect(update).toHaveBeenCalledWith('d-1', {
      status: 'SENT',
      provider: 'acs',
      attempts: 1,
      lastError: null,
      nextAttemptAt: null,
      sentAt: now,
      params: null,
    });
    expect(result.status).toBe('SENT');
  });

  it('keeps it PENDING with a growing wait while attempts remain', async () => {
    const sendEmail = jest
      .fn()
      .mockRejectedValue(
        new EmailSendError('acs: 503; emailjs: 429', 'emailjs'),
      );
    const { attempt, update } = build(sendEmail);

    await attempt.execute(buildDelivery({ attempts: 1 }), () => now);

    expect(update).toHaveBeenCalledWith('d-1', {
      status: 'PENDING',
      provider: 'emailjs',
      attempts: 2,
      lastError: 'acs: 503; emailjs: 429',
      nextAttemptAt: new Date('2026-11-08T10:02:00Z'),
    });
  });

  it('marks it FAILED and clears the params when the attempts run out', async () => {
    const sendEmail = jest
      .fn()
      .mockRejectedValue(new EmailSendError('acs: rejected', 'acs'));
    const { attempt, update } = build(sendEmail);

    await attempt.execute(buildDelivery({ attempts: 2 }), () => now);

    expect(update).toHaveBeenCalledWith('d-1', {
      status: 'FAILED',
      provider: 'acs',
      attempts: 3,
      lastError: 'acs: rejected',
      nextAttemptAt: null,
      params: null,
    });
  });

  it('records an error that is not from a provider, such as a missing template', async () => {
    const sendEmail = jest.fn().mockRejectedValue(new Error('ENOENT'));
    const { attempt, update } = build(sendEmail);

    await attempt.execute(buildDelivery(), () => now);

    expect(update).toHaveBeenCalledWith(
      'd-1',
      expect.objectContaining({ lastError: 'ENOENT', provider: null }),
    );
  });

  describe('when saving SENT fails after the email went out', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const run = async (attempt: AttemptEmailDelivery) => {
      const result = attempt.execute(buildDelivery(), () => now);
      for (const delay of SENT_WRITE_RETRY_DELAYS_MS) {
        await jest.advanceTimersByTimeAsync(delay);
      }
      return result;
    };

    it('tries the write again and never sends twice', async () => {
      const sendEmail = jest.fn().mockResolvedValue({ provider: 'acs' });
      const { attempt, update } = build(sendEmail);
      update.mockRejectedValueOnce(new Error('connection terminated'));

      const result = await run(attempt);

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenLastCalledWith(
        'd-1',
        expect.objectContaining({ status: 'SENT' }),
      );
      expect(result.status).toBe('SENT');
    });

    it('only logs when the write keeps failing, without scheduling a retry', async () => {
      const sendEmail = jest.fn().mockResolvedValue({ provider: 'acs' });
      const { attempt, update } = build(sendEmail);
      update.mockRejectedValue(new Error('connection terminated'));

      const result = await run(attempt);

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(SENT_WRITE_RETRY_DELAYS_MS.length + 1);
      for (const [, data] of update.mock.calls) {
        expect(data).toMatchObject({ status: 'SENT', nextAttemptAt: null });
      }
      expect(result).toMatchObject({ status: 'SENT', provider: 'acs' });
    });
  });
});
