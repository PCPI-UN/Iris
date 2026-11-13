import { NestFactory } from '@nestjs/core';
import { InvitationServiceModule } from './invitation-service.module';
import { MicroserviceOptions, Transport, RpcException } from '@nestjs/microservices';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { validationErrorMessages } from '@app/common/i18n/validation-messages';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    InvitationServiceModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'invitation',
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
          arrays: true
        },
        protoPath: join(process.cwd(), 'libs/common/src/protos/invitation.proto'),
        url: `${process.env.GRPC_HOST || '0.0.0.0'}:${
          process.env.GRPC_PORT || 50054
        }`,
      }
    },
  );

  app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false, // Allow protobuf internal fields like _firstName, _lastName
      exceptionFactory: (errors: ValidationError[]) =>
        new RpcException({
          code: 3, // Equivalent to HTTP 400 Bad Request
          message: `Validación fallida: ${validationErrorMessages(errors).join('; ')}`,
        }),
    }));
  await app.listen();

}
bootstrap();
