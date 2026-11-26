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
        message: 'Se debe indicar al menos un rol',
      });
    }

    const roles = await this.roleRepository.findByIds(uniqueRoleIds);
    if (roles.length !== uniqueRoleIds.length) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Uno o más de los roles indicados no existen',
      });
    }

    const eventRoles = roles.filter((role) => role.scope !== PLATFORM_SCOPE);
    if (eventRoles.length > 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Los roles ${eventRoles.map((role) => role.name).join(', ')} son roles de evento y no se pueden asignar como roles de plataforma`,
      });
    }

    return roles;
  }
}
