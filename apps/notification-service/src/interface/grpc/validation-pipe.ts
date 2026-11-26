import { ValidationPipe } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { ValidationError } from 'class-validator';

/**
 * Same pipe as the other services: the DTO rules (e.g. the idempotencyKey
 * length) answer INVALID_ARGUMENT instead of reaching the database.
 */
export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: false,
    exceptionFactory: (errors: ValidationError[]) =>
      new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Validation failed: ${errors
          .map(
            (error) =>
              `${error.property}: ${
                Object.values(error.constraints ?? {}).join(', ') ||
                'validation failed'
              }`,
          )
          .join('; ')}`,
      }),
  });
}
