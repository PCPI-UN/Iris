import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { AppUser } from '../../modules/auth/types/app-user.type';

/**
 * Checks the permissions declared with `@RequirePermission()` against the ones the
 * auth-service returned for this request (`JwtStrategy` loads them on every call), so a
 * role change applies on the next request. The result is not cached: comparing a short
 * list in memory is cheaper than a cache lookup, and a cached result would outlive a
 * role change.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: AppUser }>().user;

    if (!user || !user.platformPermissions) {
      this.logger.warn(`Permission check failed: No user or permissions found`);
      throw new ForbiddenException('User does not have required permissions');
    }

    // Admin users bypass all permission checks
    const isAdmin = user.platformRoles?.some((role) => role.name === 'Admin');
    if (isAdmin) {
      return true;
    }

    const missingPermissions = requiredPermissions.filter(
      (permission) => !user.platformPermissions.includes(permission),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Missing required permissions: ${missingPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
