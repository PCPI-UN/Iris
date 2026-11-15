import { Inject, Injectable } from '@nestjs/common';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import { ACADEMIC_READER_ROLE_IDS, ProjectReadScope, resolveReadScope } from '../../domain/read-scope';

/**
 * Read scope of a user for the academic read endpoints. The roles come from auth-service,
 * not from the caller, so a role change applies on the next request.
 */
@Injectable()
export class ResolveProjectReadScopeUC {
  constructor(@Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort) {}

  /** Null when the user holds no active role that grants projects. */
  async execute(userId: number): Promise<ProjectReadScope | null> {
    const [holder] = await this.auth.findUsersByRoles({
      roleIds: ACADEMIC_READER_ROLE_IDS,
      userIds: [userId],
    });
    return resolveReadScope(userId, holder?.roleIds ?? []);
  }
}
