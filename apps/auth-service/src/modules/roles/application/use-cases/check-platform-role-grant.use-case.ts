import { Injectable } from '@nestjs/common';
import { Role } from '@roles/domain/entities/role.entity';
import { ResolvePlatformRolesUseCase } from './resolve-platform-roles.use-case';
import { AccountAdministrationPolicy } from '../services/account-administration.policy';

/**
 * Whether `actorUserId` may grant these platform roles, with the rules of
 * AccountAdministrationPolicy: only PLATFORM roles, administrator roles (Admin,
 * FacultyAdmin) only with `manage:admins`, and never to oneself (`targetUserId`, when known).
 *
 * Used by invitation-service before creating a platform invitation and again when it is
 * accepted, so an invitation cannot raise anyone's privileges beyond the inviter's.
 */
@Injectable()
export class CheckPlatformRoleGrantUseCase {
  constructor(
    private readonly resolvePlatformRoles: ResolvePlatformRolesUseCase,
    private readonly administrationPolicy: AccountAdministrationPolicy,
  ) {}

  async execute(input: {
    actorUserId: number;
    roleIds: number[];
    targetUserId?: number;
  }): Promise<Role[]> {
    const roles = await this.resolvePlatformRoles.execute(input.roleIds);
    const actor = await this.administrationPolicy.loadActor(input.actorUserId);
    if (input.targetUserId) {
      this.administrationPolicy.assertNotSelf(actor, input.targetUserId, 'cambiar los roles de');
    }
    this.administrationPolicy.assertCanGrant(actor, roles);
    return roles;
  }
}
