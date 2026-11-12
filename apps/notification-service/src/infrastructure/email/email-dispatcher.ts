import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmailServicePort,
  SendEmailParams,
} from '../../application/ports/email.service.port';
import { EmailProvider } from '../../application/ports/email-provider.port';
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
  }: SendEmailParams): Promise<{ success: boolean }> {
    const rendered = await this.renderer.render(template, params);

    for (const [index, provider] of this.providers.entries()) {
      try {
        await provider.send({ to, ...rendered });
        this.logger.log(`Email sent via ${provider.name}`, { to, template });
        return { success: true };
      } catch (error: unknown) {
        const next = this.providers[index + 1];
        this.logger.warn(
          `Email provider ${provider.name} failed` +
            (next ? `, trying ${next.name}` : ''),
          { to, template, error: (error as Error)?.message },
        );
      }
    }

    this.logger.error('All email providers failed', { to, template });
    throw new Error('Failed to send email');
  }
}
