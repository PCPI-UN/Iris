import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationController } from './interface/grpc/notification.controller';
import { SendEmailUseCase } from './application/use-cases/send-email.use-case';
import { GetEmailStatusUseCase } from './application/use-cases/get-email-status.use-case';
import { RetryDueEmailsUseCase } from './application/use-cases/retry-due-emails.use-case';
import {
  AttemptEmailDelivery,
  EMAIL_RETRY_POLICY,
} from './application/use-cases/attempt-email-delivery';
import { EmailServicePort } from './application/ports/email.service.port';
import { EmailDeliveryRepositoryPort } from './application/ports/email-delivery.repository.port';
import { RetryPolicy } from './domain/email-delivery';
import { EmailDispatcher } from './infrastructure/email/email-dispatcher';
import { EmailTemplateRenderer } from './infrastructure/email/email-template.renderer';
import {
  EMAIL_PROVIDERS,
  resolveEmailProviders,
} from './infrastructure/email/providers/email-providers';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import { PrismaEmailDeliveryRepository } from './infrastructure/persistence/prisma-email-delivery.repository';
import {
  EMAIL_RETRY_WORKER_OPTIONS,
  EmailRetryWorker,
  EmailRetryWorkerOptions,
} from './infrastructure/scheduling/email-retry.worker';

const positiveInt = (
  config: ConfigService,
  key: string,
  fallback: number,
  min = 1,
): number => {
  const raw = config.get<string>(key)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${key} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
};

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [NotificationController],
  providers: [
    PrismaService,
    {
      provide: EmailDeliveryRepositoryPort,
      useClass: PrismaEmailDeliveryRepository,
    },
    { provide: EmailTemplateRenderer, useValue: new EmailTemplateRenderer() },
    {
      provide: EMAIL_PROVIDERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveEmailProviders((key) => config.get<string>(key)),
    },
    { provide: EmailServicePort, useClass: EmailDispatcher },
    {
      provide: EMAIL_RETRY_POLICY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): RetryPolicy => ({
        maxAttempts: positiveInt(config, 'EMAIL_MAX_ATTEMPTS', 5),
        baseDelayMs: positiveInt(config, 'EMAIL_RETRY_BASE_DELAY_MS', 60_000),
      }),
    },
    {
      provide: EMAIL_RETRY_WORKER_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailRetryWorkerOptions => ({
        pollMs: positiveInt(config, 'EMAIL_RETRY_POLL_MS', 15_000, 0),
        batchSize: positiveInt(config, 'EMAIL_RETRY_BATCH_SIZE', 20),
      }),
    },
    AttemptEmailDelivery,
    SendEmailUseCase,
    RetryDueEmailsUseCase,
    GetEmailStatusUseCase,
    EmailRetryWorker,
  ],
})
export class NotificationServiceModule {}
