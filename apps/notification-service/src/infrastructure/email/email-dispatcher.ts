import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmailSendError,
  EmailServicePort,
  ProviderFailure,
  SendEmailParams,
  SendEmailResult,
} from '../../application/ports/email.service.port';
import { EmailProvider } from '../../application/ports/email-provider.port';
import { describeError } from './describe-error';
import { EmailTemplateRenderer } from './email-template.renderer';
import { EMAIL_PROVIDERS } from './providers/email-providers';

/**
 * Renders the email once and tries each provider in order: the primary first,
 * then the fallback. Fails only when every configured provider failed.
 */
@Injectable()
export class EmailDispatcher implements EmailServicePort {
  private readonly logger = new Logger(EmailDispatcher.name);

  constructor(
    @Inject(EMAIL_PROVIDERS) private readonly providers: EmailProvider[],
    private readonly renderer: EmailTemplateRenderer,
  ) {}

  async sendEmail({
    to,
    template,
    params,
  }: SendEmailParams): Promise<SendEmailResult> {
    const rendered = await this.renderer.render(template, params);
    const failures: ProviderFailure[] = [];
    let lastError: unknown;

    for (const [index, provider] of this.providers.entries()) {
      try {
        await provider.send({ to, ...rendered });
        this.logger.log(`Email sent via ${provider.name}`, { template });
        return { provider: provider.name };
      } catch (error: unknown) {
        lastError = error;
        failures.push({ provider: provider.name, error: describeError(error) });
        const next = this.providers[index + 1];
        this.logger.warn(
          `Email provider ${provider.name} failed` +
            (next ? `, trying ${next.name}` : ''),
          { template, error: describeError(error) },
        );
      }
    }

    throw new EmailSendError(failures, { cause: lastError });
  }
}
