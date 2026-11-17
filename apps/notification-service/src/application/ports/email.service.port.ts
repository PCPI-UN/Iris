import { EmailTemplate } from '@app/common/generated/notification';
import { ConfirmOutcome, SendOutcome } from './email-provider.port';

export interface SendEmailParams {
  to: string;
  params: Record<string, unknown>;
  template: EmailTemplate;
  /** Operation id of the delivery, for the providers that dedupe by it */
  ref?: string;
  /**
   * The previous attempt with `ref` got no answer from its provider. If it
   * gets none again, the email goes to the next provider, at the risk of
   * arriving twice; otherwise it waits for the next attempt.
   */
  fallbackIfInDoubt?: boolean;
  /**
   * Start the chain after this provider: it reported that it did not send
   * the email, so the next providers cannot send it twice.
   */
  after?: string;
}

/** Which provider took the email and whether it is already delivered. */
export interface SendEmailResult {
  provider: string;
  outcome: SendOutcome;
}

/** Why one provider did not send the email. */
export interface ProviderFailure {
  provider: string;
  error: string;
}

/**
 * Thrown when no provider took the email. `provider` is the last one tried,
 * `failures` has one entry per provider and `cause` is the last provider's
 * original error. `inDoubt` is true when a provider that got `ref` gave no
 * answer: it may have the email, so the next attempt must reuse `ref`.
 */
export class EmailSendError extends Error {
  readonly provider: string | null;
  readonly inDoubt: boolean;

  constructor(
    readonly failures: ProviderFailure[],
    options?: { cause?: unknown; inDoubt?: boolean },
  ) {
    super(
      failures.map(({ provider, error }) => `${provider}: ${error}`).join('; '),
      { cause: options?.cause },
    );
    this.name = 'EmailSendError';
    this.provider = failures[failures.length - 1]?.provider ?? null;
    this.inDoubt = options?.inDoubt ?? false;
  }
}

/** One delivery attempt through the provider chain (primary, then fallback). */
export abstract class EmailServicePort {
  abstract sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
  /** True when some provider in the chain dedupes by `ref`. */
  abstract usesRef(): boolean;
  /** Final status of an email that `provider` accepted with `ref`. */
  abstract confirm(provider: string, ref: string): Promise<ConfirmOutcome>;
}
