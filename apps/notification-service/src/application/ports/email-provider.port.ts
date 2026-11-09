/** A rendered email, ready to hand to any provider. */
export interface EmailContent {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * One email provider (Azure ACS, EmailJS, ...). Adding a provider means a new
 * adapter implementing this interface plus one entry in the provider registry.
 */
export interface EmailProvider {
  readonly name: string;
  /** Resolves once the provider accepted the email; throws if it was not sent. */
  send(email: EmailContent): Promise<void>;
}
