export const AUTH_SERVICE_PORT = 'AUTH_SERVICE_PORT';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName?: string;
  email: string;
  status: string;
}

export interface RoleHolder {
  id: number;
  firstName: string;
  lastName?: string;
  /** Active roles of the user among the requested ones. */
  roleIds: number[];
}

export interface AuthServicePort {
  /** Returns null when no user has that email. */
  findUserByEmail(email: string): Promise<AuthUser | null>;
  /** Users by id; ids with no user are left out of the result. */
  findUsersByIds(ids: number[]): Promise<AuthUser[]>;
  /** Active users holding at least one of the roles; userIds restricts the result to those ids. */
  findUsersByRoles(input: { roleIds: number[]; userIds?: number[] }): Promise<RoleHolder[]>;
  /** Adds the platform roles to the user, keeping the ones already held. */
  assignPlatformRoles(userId: number, roleIds: number[]): Promise<void>;
}
