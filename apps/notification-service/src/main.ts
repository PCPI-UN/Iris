import { NestFactory } from '@nestjs/core';
import { NotificationServiceModule } from './notification-service.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
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

  await app.listen();
}
bootstrap();
