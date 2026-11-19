/** A rendered email, ready to hand to any provider. */
export interface EmailContent {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * `sent`: the provider delivered the email or reports it as delivered.
 * `accepted`: the provider took the email and delivers it on its own; its
 * final status is confirmed later with `confirm`.
 */
export type SendOutcome = 'sent' | 'accepted';

export type ConfirmOutcome =
  | { status: 'sent' }
  | { status: 'pending' }
  | { status: 'failed'; error: string };

/**
 * The provider gave no answer (timeout, 5xx, connection lost after the
 * request left): it may have taken the email. Handing the email to another
 * provider could send it twice.
 */
export class EmailInDoubtError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EmailInDoubtError';
  }
}

/**
 * One email provider (Azure ACS, EmailJS, ...). Adding a provider means a new
 * adapter implementing this interface plus one entry in the provider registry.
 *
 * Any error other than `EmailInDoubtError` means the provider did not take
 * the email, so the next provider may send it.
 */
export interface EmailProvider {
  readonly name: string;
  /**
   * `ref` is the operation id of the delivery, given only to providers that
   * implement `confirm`. Sending again with the same `ref` never sends a
   * second email: the provider rejects the repeated id.
   */
  send(email: EmailContent, ref?: string): Promise<SendOutcome>;
  /** Final status of the email sent with `ref`. Only providers that dedupe by `ref`. */
  confirm?: (ref: string) => Promise<ConfirmOutcome>;
}
