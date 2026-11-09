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

/** Thrown when every configured provider failed; `provider` is the last one tried. */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly provider: string | null,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

/** One delivery attempt through the provider chain (primary, then fallback). */
export abstract class EmailServicePort {
  abstract sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}
