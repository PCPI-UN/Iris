import { EmailClient, EmailMessage } from '@azure/communication-email';
import {
  EmailContent,
  EmailProvider,
} from '../../../application/ports/email-provider.port';

export interface AcsConfig {
  connectionString: string;
  senderAddress: string;
  timeoutMs?: number;
}

type AcsClient = Pick<EmailClient, 'beginSend'>;

const DEFAULT_TIMEOUT_MS = 30_000;

/** Azure Communication Services Email. Waits for Azure's final status. */
export class AcsAdapter implements EmailProvider {
  readonly name = 'acs';
  private readonly timeoutMs: number;

  constructor(
    private readonly config: AcsConfig,
    private readonly client: AcsClient = new EmailClient(
      config.connectionString,
    ),
  ) {
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send({ to, subject, html, text }: EmailContent): Promise<void> {
    const message: EmailMessage = {
      senderAddress: this.config.senderAddress,
      recipients: { to: [{ address: to }] },
      content: { subject, plainText: text, html },
    };

    const abortSignal = AbortSignal.timeout(this.timeoutMs);
    const poller = await this.client.beginSend(message, { abortSignal });
    const result = await poller.pollUntilDone({ abortSignal });

    if (result.status !== 'Succeeded') {
      const reason = result.error?.message ?? 'no error detail';
      throw new Error(`ACS send ${result.status}: ${reason}`);
    }
  }
}
