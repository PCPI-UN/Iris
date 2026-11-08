import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { RoleRepositoryPort } from '@roles/domain/repositories/role.repository.port';
import { Role } from '@roles/domain/entities/role.entity';

const PLATFORM_SCOPE = 'PLATFORM';

/**
 * Loads the roles to grant to a platform account: they must exist and be PLATFORM roles.
 * Event roles (Juror, Participant) are granted through event membership, never as
 * platform roles: as platform roles their permissions would apply to every event.
 */
@Injectable()
export class ResolvePlatformRolesUseCase {
  constructor(private readonly roleRepository: RoleRepositoryPort) {}

  async execute(roleIds: number[]): Promise<Role[]> {
    const uniqueRoleIds = [...new Set(roleIds ?? [])];
    if (uniqueRoleIds.length === 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'At least one role must be provided',
      });
    }

    const roles = await this.roleRepository.findByIds(uniqueRoleIds);
    if (roles.length !== uniqueRoleIds.length) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'One or more of the provided roles do not exist',
      });
    }

    const eventRoles = roles.filter((role) => role.scope !== PLATFORM_SCOPE);
    if (eventRoles.length > 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Roles ${eventRoles.map((role) => role.name).join(', ')} are event roles and cannot be granted as platform roles`,
      });
    }

    return roles;
  }
}
