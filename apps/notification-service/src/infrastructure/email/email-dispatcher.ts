import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmailSendError,
  EmailServicePort,
  ProviderFailure,
  SendEmailParams,
  SendEmailResult,
} from '../../application/ports/email.service.port';
import {
  ConfirmOutcome,
  EmailInDoubtError,
  EmailProvider,
} from '../../application/ports/email-provider.port';
import { describeError } from './describe-error';
import { EmailTemplateRenderer } from './email-template.renderer';
import { EMAIL_PROVIDERS } from './providers/email-providers';

/**
 * Renders the email once and tries each provider in order: the primary first,
 * then the fallback. A provider that took the email (sent or accepted) ends
 * the chain. A provider that gave no answer may have it, so the chain stops
 * there unless the previous attempt also got no answer (`fallbackIfInDoubt`).
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
    ref,
    fallbackIfInDoubt = false,
  }: SendEmailParams): Promise<SendEmailResult> {
    const rendered = await this.renderer.render(template, params);
    const failures: ProviderFailure[] = [];
    let lastError: unknown;
    let inDoubt = false;

    for (const [index, provider] of this.providers.entries()) {
      try {
        const outcome = await provider.send(
          { to, ...rendered },
          provider.confirm ? ref : undefined,
        );
        this.logger.log(`Email ${outcome} by ${provider.name}`, { template });
        return { provider: provider.name, outcome };
      } catch (error: unknown) {
        lastError = error;
        const described = describeError(error);
        failures.push({ provider: provider.name, error: described });

        if (error instanceof EmailInDoubtError) {
          inDoubt = true;
          if (!fallbackIfInDoubt) {
            this.logger.warn(
              `Email provider ${provider.name} gave no answer; trying it again on the next attempt`,
              { template, error: described },
            );
            break;
          }
        }

        const next = this.providers[index + 1];
        this.logger.warn(
          `Email provider ${provider.name} failed` +
            (next ? `, trying ${next.name}` : ''),
          { template, error: described },
        );
      }
    }

    throw new EmailSendError(failures, { cause: lastError, inDoubt });
  }

  usesRef(): boolean {
    return this.providers.some((provider) => provider.confirm);
  }

  confirm(providerName: string, ref: string): Promise<ConfirmOutcome> {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider?.confirm) {
      return Promise.reject(
        new Error(`Email provider ${providerName} cannot confirm a delivery`),
      );
    }
    return provider.confirm(ref);
  }
}
