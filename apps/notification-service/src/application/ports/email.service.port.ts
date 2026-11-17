import { EmailTemplate } from '@app/common/generated/notification';

export interface SendEmailParams {
  to: string;
  params: Record<string, unknown>;
  template: EmailTemplate;
}

/** Which provider accepted the email. */
export interface SendEmailResult {
  provider: string;
}

/** Why one provider did not send the email. */
export interface ProviderFailure {
  provider: string;
  error: string;
}

/**
 * Thrown when every configured provider failed. `provider` is the last one
 * tried, `failures` has one entry per provider and `cause` is the last
 * provider's original error.
 */
export class EmailSendError extends Error {
  readonly provider: string | null;

  constructor(
    readonly failures: ProviderFailure[],
    options?: { cause?: unknown },
  ) {
    super(
      failures.map(({ provider, error }) => `${provider}: ${error}`).join('; '),
      options,
    );
    this.name = 'EmailSendError';
    this.provider = failures[failures.length - 1]?.provider ?? null;
  }
}

/** One delivery attempt through the provider chain (primary, then fallback). */
export abstract class EmailServicePort {
  abstract sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}
