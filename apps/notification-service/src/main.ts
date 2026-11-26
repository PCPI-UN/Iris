import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { SendEmailUseCase } from './application/use-cases/send-email.use-case';
import { buildValidationPipe } from './interface/grpc/validation-pipe';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    NotificationServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'notification',
        protoPath: join(
          process.cwd(),
          'libs/common/src/protos/notification.proto',
        ),
        url: `${process.env.GRPC_HOST || '0.0.0.0'}:${
          process.env.GRPC_PORT || 50056
        }`,
      },
    },
  );

  app.useGlobalPipes(buildValidationPipe());

  // Nest's shutdown hooks are off: SIGTERM is handled here so that the email
  // attempts running in the background finish before the app closes
  const SHUTDOWN_WAIT_MS = 20_000;
  const shutdown = () =>
    void app
      .get(SendEmailUseCase)
      .drain(SHUTDOWN_WAIT_MS)
      .finally(() => void app.close());
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  await app.listen();
}
bootstrap();
