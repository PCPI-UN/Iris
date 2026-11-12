import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { PermissionRepositoryPort } from '@permissions/domain/repositories/permission.repository.port';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { Role } from '@roles/domain/entities/role.entity';
import { IsPlatformStaffDto } from '../dto/is-platform-staff.dto';

export interface IsPlatformStaffResponse {
  isPlatformStaff: boolean;
  role?: {
    id: number;
    name: string;
    scope: string;
    description: string;
  };
}

const ADMIN_ROLE_NAME = 'Admin';
const PLATFORM_STAFF_PERMISSION = 'read:events';

@Injectable()
export class IsPlatformStaffUseCase {
  constructor(
    private readonly permissionRepository: PermissionRepositoryPort,
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(dto: IsPlatformStaffDto): Promise<IsPlatformStaffResponse> {
    let userId: number;

    // Resolve userId from email if provided
    if (dto.email) {
      const user = await this.userRepository.findByEmail(dto.email);
      if (!user) {
        throw new RpcException({
          code: status.NOT_FOUND,
          message: `User with email '${dto.email}' not found`,
        });
      }
      userId = user.id;
    } else if (dto.userId) {
      userId = dto.userId;
    } else {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Either userId or email must be provided',
      });
    }

    // Get user's platform permissions and roles
    const data =
      await this.permissionRepository.findUserPlatformPermissions(userId);

    // Platform staff can see every event. It is decided by permission, not by role name,
    // so every role that reads all events (Admin, FacultyAdmin, EventManager, Dean) counts.
    const isStaff =
      data.roles.some((role: Role) => role.name === ADMIN_ROLE_NAME) ||
      data.permissions.some(
        (permission) =>
          `${permission.action}:${permission.resource}` === PLATFORM_STAFF_PERMISSION,
      );

    if (!isStaff) {
      return {
        isPlatformStaff: false,
      };
    }

    // A user can hold several platform roles; Admin wins, otherwise the first one
    const platformRole =
      data.roles.find((role: Role) => role.name === ADMIN_ROLE_NAME) ?? data.roles[0];

    return {
      isPlatformStaff: true,
      role: {
        id: platformRole.id,
        name: platformRole.name,
        scope: platformRole.scope,
        description: platformRole.description,
      },
    };
  }
}