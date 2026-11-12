import { Injectable } from '@nestjs/common';
import {
  PlatformStaffRepositoryPort,
  UserWithRoleIds,
} from '@roles/domain/repositories/platform-staff.repository.port';

export const FIND_USERS_BY_ROLES_MAX_LIMIT = 10;

export interface FindUsersByRolesInput {
  roleIds?: number[];
  search?: string;
  userIds?: number[];
  limit?: number;
}

@Injectable()
export class FindUsersByRolesUseCase {
  constructor(
    private readonly platformStaffRepository: PlatformStaffRepositoryPort,
  ) {}

  async execute(input: FindUsersByRolesInput): Promise<UserWithRoleIds[]> {
    const roleIds = [...new Set(input.roleIds ?? [])];
    if (roleIds.length === 0) {
      return [];
    }

    const search = input.search?.trim();
    const userIds = [...new Set(input.userIds ?? [])];

    // A lookup by ids is bounded by the ids themselves; the cap only protects the free-text search
    const requestedLimit = input.limit ?? FIND_USERS_BY_ROLES_MAX_LIMIT;
    const limit =
      userIds.length > 0
        ? userIds.length
        : Math.min(Math.max(requestedLimit, 1), FIND_USERS_BY_ROLES_MAX_LIMIT);

    return await this.platformStaffRepository.findActiveUsersByRoles({
      roleIds,
      search: search || undefined,
      userIds: userIds.length > 0 ? userIds : undefined,
      limit,
    });
  }
}
