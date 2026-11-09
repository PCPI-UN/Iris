import { Module } from '@nestjs/common';
import { NotificationController } from './interface/grpc/notification.controller';
import { SendEmailUseCase } from './application/use-cases/send-email.use-case';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailServicePort } from './application/ports/email.service.port';
import { EmailDispatcher } from './infrastructure/email/email-dispatcher';
import { EmailTemplateRenderer } from './infrastructure/email/email-template.renderer';
import {
  EMAIL_PROVIDERS,
  resolveEmailProviders,
} from './infrastructure/email/providers/email-providers';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [NotificationController],
  providers: [
    SendEmailUseCase,
    { provide: EmailTemplateRenderer, useValue: new EmailTemplateRenderer() },
    {
      provide: EMAIL_PROVIDERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        resolveEmailProviders((key) => config.get<string>(key)),
    },
    { provide: EmailServicePort, useClass: EmailDispatcher },
  ],
})
export class NotificationServiceModule {}
