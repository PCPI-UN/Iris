import { SetMetadata } from '@nestjs/common';

export const ANY_PERMISSIONS_KEY = 'anyPermissions';

/**
 * The caller needs at least one of these permissions (unlike `@RequirePermission`, which needs
 * all of them). Used where two roles reach the same endpoint through different permissions,
 * e.g. tutors are replaced by event managers (manage:events) and by project administrators
 * (manage:projects).
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
