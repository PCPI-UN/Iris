import { Inject, Injectable } from '@nestjs/common';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import { ProjectReadScope, RequestedReadScope, resolveReadScope } from '../../domain/read-scope';

/**
 * Read scope of a user for the academic read endpoints. The permissions come from
 * auth-service (active platform roles only), not from the caller, so a change applies on
 * the next request.
 */
@Injectable()
export class ResolveProjectReadScopeUC {
  constructor(@Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort) {}

  /** Null when no permission of the user grants projects, or none grants the requested scope. */
  async execute(userId: number, requested?: RequestedReadScope): Promise<ProjectReadScope | null> {
    return resolveReadScope(userId, await this.auth.getUserPermissions(userId), requested);
  }
}
