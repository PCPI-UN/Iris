import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Type,
  mixin,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

/**
 * Rejects with 400 a body that has fields not declared in the given DTO.
 *
 * The global ValidationPipe (whitelist: true) strips unknown fields before any
 * route-level pipe runs, so a route pipe with forbidNonWhitelisted never sees
 * them and the request looks successful. A guard runs before the pipes, on the
 * raw body. The DTO is the only source of truth for the allowed fields.
 */
export function ForbidUnknownFields(dto: Type<object>): Type<CanActivate> {
  @Injectable()
  class ForbidUnknownFieldsGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const body =
        context.switchToHttp().getRequest<{ body?: object }>().body ?? {};
      const rejected = validateSync(plainToInstance(dto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
        .filter((error) => error.constraints?.whitelistValidation)
        .map((error) => error.property);

      if (rejected.length > 0) {
        throw new BadRequestException(
          `These fields cannot be edited: ${rejected.join(', ')}`,
        );
      }
      return true;
    }
  }

  return mixin(ForbidUnknownFieldsGuard);
}
