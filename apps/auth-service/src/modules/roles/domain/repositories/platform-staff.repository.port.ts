import { PlatformStaff } from '../entities/platform-staff.entity';
import { TransactionClient } from '@common/prisma/types/transaction-client.type';

export interface ActiveRole {
  id: number;
  name: string;
  scope: string;
  permissions: string[];
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
}
