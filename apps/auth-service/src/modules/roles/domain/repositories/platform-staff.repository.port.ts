import { PlatformStaff } from '../entities/platform-staff.entity';
import { TransactionClient } from '@common/prisma/types/transaction-client.type';

export interface ActiveRole {
  id: number;
  name: string;
  scope: string;
  permissions: string[];
}

export interface FindActiveUsersByRolesCriteria {
  roleIds: number[];
  search?: string;
  userIds?: number[];
  limit: number;
}

export interface UserWithRoleIds {
  id: number;
  firstName: string;
  lastName: string | null;
  /** Active roles of the user among the requested ones. */
  roleIds: number[];
}

export abstract class PlatformStaffRepositoryPort {
  /** Active platform roles of a user, with their permissions as `action:resource`. */
  abstract findActiveRoles(userId: number): Promise<ActiveRole[]>;

  /** Leaves exactly the given roles active for the user (reactivating removed ones). */
  abstract setActiveRoles(userId: number, roleIds: number[]): Promise<void>;

  abstract findByUserIdAndRoleId(
    userId: number,
    roleId: number,
  ): Promise<PlatformStaff | null>;

  abstract countActiveAdminsByRoleId(
    roleId: number,
    excludeUserId: number,
  ): Promise<number>;

  abstract deactivate(userId: number, roleId: number): Promise<void>;

  abstract assignRoles(
    userId: number,
    roleIds: number[],
    tx?: TransactionClient,
  ): Promise<void>;

  /** Active users with at least one active platform role among `roleIds`. */
  abstract findActiveUsersByRoles(
    criteria: FindActiveUsersByRolesCriteria,
  ): Promise<UserWithRoleIds[]>;
}
