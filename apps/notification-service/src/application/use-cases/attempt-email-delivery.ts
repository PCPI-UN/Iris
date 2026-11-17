import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailTemplate } from '@app/common/generated/notification';
import {
  EmailDelivery,
  RetryPolicy,
  isAwaitingConfirmation,
  isInDoubt,
  nextAttemptAt,
} from '../../domain/email-delivery';
import {
  EmailDeliveryRepositoryPort,
  EmailDeliveryUpdate,
} from '../ports/email-delivery.repository.port';
import { ConfirmOutcome } from '../ports/email-provider.port';
import { EmailSendError, EmailServicePort } from '../ports/email.service.port';

export const EMAIL_RETRY_POLICY = Symbol('EMAIL_RETRY_POLICY');

/** How long an attempt may run before the retry worker can take the row again. */
export const ATTEMPT_LEASE_MS = 5 * 60_000;

const MAX_ERROR_LENGTH = 1_000;

/** Waits before trying again to save the status of an email a provider took. */
export const SENT_WRITE_RETRY_DELAYS_MS = [200, 1_000];

/**
 * Runs one step of a delivery and records the outcome. A delivery that a
 * provider already accepted only gets its final status checked; any other
 * goes through the provider chain. Outcomes: SENT, PENDING (accepted and to
 * be confirmed, or a retry scheduled) or FAILED when the attempts are
 * exhausted. Parameters are cleared once the status is final, since they may
 * hold invitation or password-reset links.
 */
@Injectable()
export class AttemptEmailDelivery {
  private readonly logger = new Logger(AttemptEmailDelivery.name);

  constructor(
    private readonly repository: EmailDeliveryRepositoryPort,
    private readonly emailService: EmailServicePort,
    @Inject(EMAIL_RETRY_POLICY) private readonly policy: RetryPolicy,
  ) {}

  execute(
    delivery: EmailDelivery,
    now: () => Date = () => new Date(),
  ): Promise<EmailDelivery> {
    return isAwaitingConfirmation(delivery)
      ? this.confirm(delivery, now)
      : this.send(delivery, now);
  }

  private async send(
    delivery: EmailDelivery,
    now: () => Date,
  ): Promise<EmailDelivery> {
    const attempts = delivery.attempts + 1;
    const fallbackIfInDoubt = isInDoubt(delivery);

    let ref = delivery.providerRef ?? undefined;
    if (!ref && this.emailService.usesRef()) {
      ref = randomUUID();
      try {
        // Saved before sending: if the service stops once the provider has the
        // email, the next attempt reuses the id and the provider rejects it
        // instead of sending a second email. A previous error belongs to the
        // old id, and keeping it would make this attempt look in doubt.
        delivery = await this.repository.update(delivery.id, {
          providerRef: ref,
          lastError: null,
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Email delivery ${delivery.id} not sent: its operation id could not be saved; the retry worker takes it later`,
          { template: delivery.template, error: errorMessage(error) },
        );
        return delivery;
      }
    }

    let result: Awaited<ReturnType<EmailServicePort['sendEmail']>>;
    try {
      result = await this.emailService.sendEmail({
        to: delivery.recipient,
        template:
          EmailTemplate[delivery.template as keyof typeof EmailTemplate],
        params: delivery.params ?? {},
        ref,
        fallbackIfInDoubt,
      });
    } catch (error: unknown) {
      const keepRef = !(error instanceof EmailSendError) || error.inDoubt;
      return this.recordFailure(delivery, {
        attempts,
        error,
        provider:
          error instanceof EmailSendError ? error.provider : delivery.provider,
        providerRef: keepRef ? (ref ?? null) : null,
        now,
      });
    }

    // The provider has the email: from here a failure is only logged, never
    // retried by sending again.
    if (result.outcome === 'accepted') {
      const acceptedAt = now();
      return this.recordTaken(delivery, {
        status: 'PENDING',
        provider: result.provider,
        acceptedAt,
        attempts,
        lastError: null,
        nextAttemptAt: new Date(
          acceptedAt.getTime() + this.policy.confirmDelayMs,
        ),
      });
    }
    return this.recordTaken(delivery, {
      status: 'SENT',
      provider: result.provider,
      attempts,
      lastError: null,
      nextAttemptAt: null,
      sentAt: now(),
      params: null,
    });
  }

  /** Reads the final status of an accepted email. Never sends it again. */
  private async confirm(
    delivery: EmailDelivery,
    now: () => Date,
  ): Promise<EmailDelivery> {
    const provider = delivery.provider ?? '';
    const ref = delivery.providerRef ?? '';
    const acceptedAt = delivery.acceptedAt ?? now();

    let outcome: ConfirmOutcome;
    let checkError: string | null = null;
    try {
      outcome = await this.emailService.confirm(provider, ref);
    } catch (error: unknown) {
      outcome = { status: 'pending' };
      checkError = `status check failed: ${errorMessage(error)}`;
    }

    if (outcome.status === 'sent') {
      return this.recordTaken(delivery, {
        status: 'SENT',
        lastError: null,
        nextAttemptAt: null,
        sentAt: now(),
        params: null,
      });
    }

    if (outcome.status === 'failed') {
      // The attempt that sent it was already counted
      return this.recordFailure(delivery, {
        attempts: delivery.attempts,
        error: `${provider}: ${outcome.error}`,
        provider,
        providerRef: null,
        now,
      });
    }

    const waited = now().getTime() - acceptedAt.getTime();
    if (waited >= this.policy.confirmTimeoutMs) {
      const lastError = truncate(
        `${provider} accepted the email but gave no final status in ${Math.round(waited / 1000)} s` +
          (checkError ? `; ${checkError}` : ''),
      );
      this.logger.warn(
        `Email delivery ${delivery.id} recorded as SENT without confirmation`,
        { template: delivery.template, error: lastError },
      );
      return this.recordTaken(delivery, {
        status: 'SENT',
        lastError,
        nextAttemptAt: null,
        sentAt: acceptedAt,
        params: null,
      });
    }

    return this.repository.update(delivery.id, {
      lastError: checkError ? truncate(checkError) : delivery.lastError,
      nextAttemptAt: new Date(now().getTime() + this.policy.confirmDelayMs),
    });
  }

  /**
   * Saves the status of an email a provider took, trying the write again a
   * few times. If it still fails the error is logged and the delivery is
   * returned as is. The row keeps its operation id, so the next attempt with
   * the same provider is rejected as repeated instead of sending again.
   */
  private async recordTaken(
    delivery: EmailDelivery,
    changes: EmailDeliveryUpdate,
  ): Promise<EmailDelivery> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.repository.update(delivery.id, changes);
      } catch (error: unknown) {
        const delay = SENT_WRITE_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          this.logger.error(
            `Email delivery ${delivery.id} was taken by ${changes.provider ?? delivery.provider} (${changes.status}) but its status could not be saved`,
            { template: delivery.template, error: errorMessage(error) },
          );
          return { ...delivery, ...changes };
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async recordFailure(
    delivery: EmailDelivery,
    failure: {
      attempts: number;
      error: unknown;
      provider: string | null;
      providerRef: string | null;
      now: () => Date;
    },
  ): Promise<EmailDelivery> {
    const { attempts, provider, providerRef, now } = failure;
    const lastError = truncate(errorMessage(failure.error));
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
      providerRef,
      acceptedAt: null,
      attempts,
      lastError,
      nextAttemptAt: retryAt,
      ...(retryAt ? {} : { params: null }),
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(message: string): string {
  return message.slice(0, MAX_ERROR_LENGTH);
}
