import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { PlatformStaffRepositoryPort } from '@roles/domain/repositories/platform-staff.repository.port';
import { ResolvePlatformRolesUseCase } from '@roles/application/use-cases/resolve-platform-roles.use-case';
import {
  ADMIN_ROLE_NAME,
  AccountAdministrationPolicy,
} from '@roles/application/services/account-administration.policy';
import { Role } from '@roles/domain/entities/role.entity';
import { SetUserPlatformRolesDto } from '../dto/set-user-platform-roles.dto';

/**
 * Replaces the platform roles of a user, e.g. a professor who signed up as User is given
 * the Professor role. Roles removed are deactivated and roles granted again are
 * reactivated, so the history of platform_staff is kept.
 */
@Injectable()
export class SetUserPlatformRolesUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly platformStaffRepository: PlatformStaffRepositoryPort,
    private readonly resolvePlatformRoles: ResolvePlatformRolesUseCase,
    private readonly administrationPolicy: AccountAdministrationPolicy,
  ) {}

  async execute({ userId, roleIds, actorUserId }: SetUserPlatformRolesDto): Promise<Role[]> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `User with ID #${userId} not found`,
      });
    }

    const roles = await this.resolvePlatformRoles.execute(roleIds);

    // IRIS-V3-ADM-02: nobody changes their own roles; only the principal administrator
    // grants, removes or touches administrator roles; the last Admin keeps the role
    const actor = await this.administrationPolicy.loadActor(actorUserId);
    this.administrationPolicy.assertNotSelf(actor, userId, 'change the roles of');
    const currentRoles = await this.administrationPolicy.assertCanManageAccount(actor, userId);
    this.administrationPolicy.assertCanGrant(actor, roles);
    if (!roles.some((role) => role.name === ADMIN_ROLE_NAME)) {
      await this.administrationPolicy.assertKeepsAnAdmin(userId, currentRoles);
    }

    await this.platformStaffRepository.setActiveRoles(
      userId,
      roles.map((role) => role.id),
    );

    return roles;
  }
}
