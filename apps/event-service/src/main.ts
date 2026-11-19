import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport, RpcException } from '@nestjs/microservices';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { validationErrorMessages } from '@app/common/i18n/validation-messages';
import {protobufPackage} from "@app/common/generated/event"
import { EventServiceModule } from './event-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    EventServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: protobufPackage,
        protoPath: join(
          process.cwd(),
          'libs/common/src/protos/event.proto',
        ),
        url: `${process.env.GRPC_HOST || '0.0.0.0'}:${
          process.env.GRPC_PORT || 50053
        }`,
      },
    },
  );

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new RpcException({
        code: 3, // Equivalent to HTTP 400 Bad Request
        message: `Validación fallida: ${validationErrorMessages(errors).join('; ')}`,
      }),
  }));

  await app.listen();
}

bootstrap();
