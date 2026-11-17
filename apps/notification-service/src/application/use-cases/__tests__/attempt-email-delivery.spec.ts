import { EmailTemplate } from '@app/common/generated/notification';
import {
  AttemptEmailDelivery,
  SENT_WRITE_RETRY_DELAYS_MS,
} from '../attempt-email-delivery';
import { EmailDelivery } from '../../../domain/email-delivery';
import { buildDelivery } from './delivery.fixture';
import { EmailDeliveryRepositoryPort } from '../../ports/email-delivery.repository.port';
import { EmailSendError } from '../../ports/email.service.port';

describe('AttemptEmailDelivery', () => {
  const now = new Date('2026-11-08T10:00:00Z');
  const policy = {
    maxAttempts: 3,
    baseDelayMs: 60_000,
    confirmDelayMs: 30_000,
    confirmTimeoutMs: 600_000,
  };

  const build = (
    sendEmail: jest.Mock,
    { usesRef = false, confirm = jest.fn() } = {},
  ) => {
    const update = jest.fn(
      (id: string, data: Partial<EmailDelivery>): Promise<EmailDelivery> =>
        Promise.resolve(buildDelivery({ id, ...data })),
    );
    const attempt = new AttemptEmailDelivery(
      { update } as unknown as EmailDeliveryRepositoryPort,
      { sendEmail, usesRef: () => usesRef, confirm },
      policy,
    );
    return { attempt, update, confirm };
  };

  const sent = (provider = 'acs') =>
    jest.fn().mockResolvedValue({ provider, outcome: 'sent' });

  it('sends with the stored template and params and records SENT', async () => {
    const sendEmail = sent();
    const { attempt, update } = build(sendEmail);

    const result = await attempt.execute(buildDelivery(), () => now);

    expect(sendEmail).toHaveBeenCalledWith({
      to: 'laura@test.local',
      template: EmailTemplate.PLATFORM_INVITATION,
      params: { firstName: 'Laura', invitationLink: 'https://iris.test/x' },
      ref: undefined,
      fallbackIfInDoubt: false,
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
    const sendEmail = jest.fn().mockRejectedValue(
      new EmailSendError([
        { provider: 'acs', error: '503' },
        { provider: 'emailjs', error: '429' },
      ]),
    );
    const { attempt, update } = build(sendEmail);

    await attempt.execute(buildDelivery({ attempts: 1 }), () => now);

    expect(update).toHaveBeenCalledWith('d-1', {
      status: 'PENDING',
      provider: 'emailjs',
      providerRef: null,
      acceptedAt: null,
      attempts: 2,
      lastError: 'acs: 503; emailjs: 429',
      nextAttemptAt: new Date('2026-11-08T10:02:00Z'),
    });
  });

  it('marks it FAILED and clears the params when the attempts run out', async () => {
    const sendEmail = jest
      .fn()
      .mockRejectedValue(
        new EmailSendError([{ provider: 'acs', error: 'rejected' }]),
      );
    const { attempt, update } = build(sendEmail);

    await attempt.execute(buildDelivery({ attempts: 2 }), () => now);

    expect(update).toHaveBeenCalledWith('d-1', {
      status: 'FAILED',
      provider: 'acs',
      providerRef: null,
      acceptedAt: null,
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

  it('does not keep the id when the error is not from a provider', async () => {
    const sendEmail = jest.fn().mockRejectedValue(new Error('ENOENT'));
    const { attempt, update } = build(sendEmail, { usesRef: true });

    await attempt.execute(buildDelivery({ providerRef: 'ref-1' }), () => now);

    expect(update).toHaveBeenCalledWith(
      'd-1',
      expect.objectContaining({ providerRef: null }),
    );
  });

  describe('operation id (providers that dedupe by it)', () => {
    it('saves a new id before sending and sends with it', async () => {
      const sendEmail = sent();
      const { attempt, update } = build(sendEmail, { usesRef: true });

      await attempt.execute(
        buildDelivery({ lastError: 'acs: rejected' }),
        () => now,
      );

      const [, saved] = update.mock.calls[0];
      expect(saved).toEqual({
        providerRef: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
        lastError: null,
      });
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(
        sendEmail.mock.invocationCallOrder[0],
      );
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: saved.providerRef,
          fallbackIfInDoubt: false,
        }),
      );
    });

    it('sends nothing when the id cannot be saved', async () => {
      const sendEmail = sent();
      const { attempt, update } = build(sendEmail, { usesRef: true });
      update.mockRejectedValueOnce(new Error('connection terminated'));

      const result = await attempt.execute(buildDelivery(), () => now);

      expect(sendEmail).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('PENDING');
    });

    it('reuses the stored id instead of creating one', async () => {
      const sendEmail = sent();
      const { attempt, update } = build(sendEmail, { usesRef: true });

      await attempt.execute(buildDelivery({ providerRef: 'ref-1' }), () => now);

      expect(update).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ ref: 'ref-1', fallbackIfInDoubt: false }),
      );
    });

    it('allows the fallback when the previous attempt got no answer', async () => {
      const sendEmail = sent('emailjs');
      const { attempt } = build(sendEmail, { usesRef: true });

      await attempt.execute(
        buildDelivery({
          providerRef: 'ref-1',
          provider: 'acs',
          lastError: 'acs: ACS gave no answer',
          attempts: 1,
        }),
        () => now,
      );

      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ ref: 'ref-1', fallbackIfInDoubt: true }),
      );
    });

    it('records an accepted email as PENDING to confirm later', async () => {
      const sendEmail = jest
        .fn()
        .mockResolvedValue({ provider: 'acs', outcome: 'accepted' });
      const { attempt, update } = build(sendEmail, { usesRef: true });

      const result = await attempt.execute(
        buildDelivery({ providerRef: 'ref-1' }),
        () => now,
      );

      expect(update).toHaveBeenCalledWith('d-1', {
        status: 'PENDING',
        provider: 'acs',
        acceptedAt: now,
        attempts: 1,
        lastError: null,
        nextAttemptAt: new Date('2026-11-08T10:00:30Z'),
      });
      expect(result.params).not.toBeNull();
    });

    it.each([
      [true, 'ref-1'],
      [false, null],
    ])(
      'when no provider took it and in doubt is %s, keeps the id as %s',
      async (inDoubt, providerRef) => {
        const sendEmail = jest
          .fn()
          .mockRejectedValue(
            new EmailSendError([{ provider: 'acs', error: 'x' }], { inDoubt }),
          );
        const { attempt, update } = build(sendEmail, { usesRef: true });

        await attempt.execute(
          buildDelivery({ providerRef: 'ref-1' }),
          () => now,
        );

        expect(update).toHaveBeenLastCalledWith(
          'd-1',
          expect.objectContaining({ status: 'PENDING', providerRef }),
        );
      },
    );
  });

  describe('confirming an accepted email', () => {
    const acceptedAt = new Date('2026-11-08T09:59:30Z');
    const accepted = (overrides: Partial<EmailDelivery> = {}) =>
      buildDelivery({
        provider: 'acs',
        providerRef: 'ref-1',
        acceptedAt,
        attempts: 1,
        ...overrides,
      });

    it('records SENT when the provider delivered it, without sending again', async () => {
      const sendEmail = jest.fn();
      const confirm = jest.fn().mockResolvedValue({ status: 'sent' });
      const { attempt, update } = build(sendEmail, { confirm });

      await attempt.execute(accepted(), () => now);

      expect(confirm).toHaveBeenCalledWith('acs', 'ref-1');
      expect(sendEmail).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith('d-1', {
        status: 'SENT',
        lastError: null,
        nextAttemptAt: null,
        sentAt: now,
        params: null,
      });
    });

    it('schedules a new attempt with a new id when the provider failed it', async () => {
      const confirm = jest
        .fn()
        .mockResolvedValue({ status: 'failed', error: 'ACS send Failed: x' });
      const { attempt, update } = build(jest.fn(), { confirm });

      await attempt.execute(accepted(), () => now);

      expect(update).toHaveBeenCalledWith('d-1', {
        status: 'PENDING',
        provider: 'acs',
        providerRef: null,
        acceptedAt: null,
        attempts: 1,
        lastError: 'acs: ACS send Failed: x',
        nextAttemptAt: new Date('2026-11-08T10:01:00Z'),
      });
    });

    it('checks again later while the provider is still delivering', async () => {
      const confirm = jest.fn().mockResolvedValue({ status: 'pending' });
      const { attempt, update } = build(jest.fn(), { confirm });

      await attempt.execute(accepted(), () => now);

      expect(update).toHaveBeenCalledWith('d-1', {
        lastError: null,
        nextAttemptAt: new Date('2026-11-08T10:00:30Z'),
      });
    });

    it('checks again later, keeping the error, when the check fails', async () => {
      const confirm = jest.fn().mockRejectedValue(new Error('timeout'));
      const { attempt, update } = build(jest.fn(), { confirm });

      await attempt.execute(accepted(), () => now);

      expect(update).toHaveBeenCalledWith('d-1', {
        lastError: 'status check failed: timeout',
        nextAttemptAt: new Date('2026-11-08T10:00:30Z'),
      });
    });

    it('records SENT without confirmation once the wait runs out', async () => {
      const confirm = jest.fn().mockResolvedValue({ status: 'pending' });
      const { attempt, update } = build(jest.fn(), { confirm });
      const late = new Date(acceptedAt.getTime() + policy.confirmTimeoutMs);

      await attempt.execute(accepted(), () => late);

      expect(update).toHaveBeenCalledWith('d-1', {
        status: 'SENT',
        lastError: 'acs accepted the email but gave no final status in 600 s',
        nextAttemptAt: null,
        sentAt: acceptedAt,
        params: null,
      });
    });
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
      const sendEmail = sent();
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
      const sendEmail = sent();
      const { attempt, update } = build(sendEmail);
      update.mockRejectedValue(new Error('connection terminated'));

      const result = await run(attempt);

      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(
        SENT_WRITE_RETRY_DELAYS_MS.length + 1,
      );
      for (const [, data] of update.mock.calls) {
        expect(data).toMatchObject({ status: 'SENT', nextAttemptAt: null });
      }
      expect(result).toMatchObject({ status: 'SENT', provider: 'acs' });
    });
  });
});
