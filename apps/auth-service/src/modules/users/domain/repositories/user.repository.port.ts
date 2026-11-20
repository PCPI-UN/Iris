import { User } from '../entities/user.entity';
import { Role } from '@roles/domain/entities/role.entity';
import { TransactionClient } from '@common/prisma/types/transaction-client.type';

export interface UserWithPlatformRoles {
  user: User;
  /** Active platform roles of the user. */
  roles: Role[];
}

export interface PaginatedUsersResult {
  users: UserWithPlatformRoles[];
  total: number;
}

export abstract class UserRepositoryPort {
  abstract save(user: User, tx?: TransactionClient): Promise<User>;
  abstract createWithRoles(user: User, roleIds: number[]): Promise<User>;
  abstract findById(id: number): Promise<User | null>;
  abstract findAll(options?: {
    page: number;
    limit: number;
    includeInactive?: boolean;
  }): Promise<PaginatedUsersResult>;
  abstract existsByEmail(email: string): Promise<boolean>;
  abstract existsByPhone(phone: string): Promise<boolean>;
  abstract deactivate(id: number): Promise<void>;
  abstract findByEmail(email: string): Promise<User | null>;
}