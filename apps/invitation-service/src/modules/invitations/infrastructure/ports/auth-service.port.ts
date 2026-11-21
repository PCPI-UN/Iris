import type {
  User,
  ActivateUserResponse,
  AssignPlatformRolesResponse,
  GetRolesByIdsResponse,
} from '@app/common/generated/auth';

export abstract class AuthServicePort {
  /**
   * Generates an account setup token for a new user.
   * This token is stored in the user_tokens table with type ACCOUNT_SETUP.
   *
   * @param userId - The ID of the user to generate the token for
   * @returns The generated token and its expiration date
   */
  abstract generateAccountSetupToken(
    userId: number,
  ): Promise<{ token: string; expiresAt: Date }>;

  /**
   * Retrieves user details by email address.
   *
   * @param email - The email address of the user
   * @returns User details
   */
  abstract getUserByEmail(email: string): Promise<User>;

  /**
   * Retrieves user details by user ID.
   *
   * @param id - The ID of the user
   * @returns User details
   */
  abstract getUser(id: number): Promise<User>;

  /**
   * Creates a basic user without roles.
   *
   * @param params - User creation parameters
   * @returns Created user details
   */
  abstract createBasicUser(params: {
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string;
  }): Promise<User>;

  /**
   * Updates user details.
   *
   * @param params - User update parameters
   * @returns Updated user details
   */
  abstract updateUser(params: {
    id: number;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<User>;

  /**
   * Activates a user with a password.
   *
   * @param params - Activation parameters
   * @returns Success status
   */
  abstract activateUser(params: {
    userId: number;
    password: string;
  }): Promise<ActivateUserResponse>;

  /**
   * Activates a user with Microsoft authentication.
   *
   * @param params - Microsoft activation parameters
   * @returns Success status
   */
  abstract activateUserWithMicrosoft(params: {
    userId: number;
    token: string;
  }): Promise<ActivateUserResponse>;

  /**
   * Assigns platform roles to a user.
   *
   * @param params - Role assignment parameters
   * @returns Success status
   */
  abstract assignPlatformRoles(params: {
    userId: number;
    roleIds: number[];
    /** Who grants them (the inviter); when set, auth-service applies the administrator rules */
    actorUserId?: number;
  }): Promise<AssignPlatformRolesResponse>;

  /**
   * Platform role names and flattened permissions of a user.
   */
  abstract getUserPlatformAccess(
    userId: number,
  ): Promise<{ roleNames: string[]; permissions: string[] }>;

  /**
   * Fails (PERMISSION_DENIED / INVALID_ARGUMENT) unless the actor may grant these platform
   * roles: platform roles only, Admin/FacultyAdmin only with manage:admins.
   */
  abstract checkPlatformRoleGrant(params: {
    actorUserId: number;
    roleIds: number[];
  }): Promise<void>;

  /**
   * Retrieves role details by role IDs.
   *
   * @param roleIds - Array of role IDs
   * @returns Response containing array of role details
   */
  abstract getRolesByIds(roleIds: number[]): Promise<GetRolesByIdsResponse>;
}
