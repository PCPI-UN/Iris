import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailTemplate } from '@app/common/generated/notification';
import {
  EmailDelivery,
  RetryPolicy,
  nextAttemptAt,
} from '../../domain/email-delivery';
import { EmailDeliveryRepositoryPort } from '../ports/email-delivery.repository.port';
import { EmailSendError, EmailServicePort } from '../ports/email.service.port';

export const EMAIL_RETRY_POLICY = Symbol('EMAIL_RETRY_POLICY');

/** How long an attempt may run before the retry worker can take the row again. */
export const ATTEMPT_LEASE_MS = 5 * 60_000;

const MAX_ERROR_LENGTH = 1_000;

/**
 * Runs one attempt of a delivery through the provider chain and records the
 * outcome: SENT, PENDING with the next retry time, or FAILED when the attempts
 * are exhausted. Parameters are cleared once the status is final, since they
 * may hold invitation or password-reset links.
 */
@Injectable()
export class AttemptEmailDelivery {
  private readonly logger = new Logger(AttemptEmailDelivery.name);

  constructor(
    private readonly repository: EmailDeliveryRepositoryPort,
    private readonly emailService: EmailServicePort,
    @Inject(EMAIL_RETRY_POLICY) private readonly policy: RetryPolicy,
  ) {}

  async execute(
    delivery: EmailDelivery,
    now: () => Date = () => new Date(),
  ): Promise<EmailDelivery> {
    const attempts = delivery.attempts + 1;

    try {
      const { provider } = await this.emailService.sendEmail({
        to: delivery.recipient,
        template:
          EmailTemplate[delivery.template as keyof typeof EmailTemplate],
        params: delivery.params ?? {},
      });

      return await this.repository.update(delivery.id, {
        status: 'SENT',
        provider,
        attempts,
        lastError: null,
        nextAttemptAt: null,
        sentAt: now(),
        params: null,
      });
    } catch (error: unknown) {
      const lastError = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, MAX_ERROR_LENGTH);
      const provider =
        error instanceof EmailSendError ? error.provider : delivery.provider;
      const retryAt = nextAttemptAt(attempts, this.policy, now());

      this.logger.warn(
        retryAt
          ? `Email delivery ${delivery.id} failed (attempt ${attempts}/${this.policy.maxAttempts}), retry at ${retryAt.toISOString()}`
          : `Email delivery ${delivery.id} failed after ${attempts} attempts`,
        { template: delivery.template, error: lastError },
      );

      return this.repository.update(delivery.id, {
        status: retryAt ? 'PENDING' : 'FAILED',
        provider,
        attempts,
        lastError,
        nextAttemptAt: retryAt,
        ...(retryAt ? {} : { params: null }),
      });
    }
  }
}
