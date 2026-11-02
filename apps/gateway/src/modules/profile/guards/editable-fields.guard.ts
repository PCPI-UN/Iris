import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { EDITABLE_PROFILE_FIELDS } from '../dto/update-profile.dto';

/**
 * Rejects the request when the body has any field outside the editable list.
 * The global ValidationPipe only strips unknown fields, which would make a
 * request with restricted fields look successful; this guard turns it into a 400.
 */
@Injectable()
export class EditableProfileFieldsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const body = context.switchToHttp().getRequest().body ?? {};
    const allowed: readonly string[] = EDITABLE_PROFILE_FIELDS;
    const rejected = Object.keys(body).filter((key) => !allowed.includes(key));

    if (rejected.length > 0) {
      throw new BadRequestException(
        `These fields cannot be edited from the profile: ${rejected.join(', ')}`,
      );
    }
    return true;
  }
}
