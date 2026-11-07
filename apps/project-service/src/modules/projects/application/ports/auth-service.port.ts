export const AUTH_SERVICE_PORT = 'AUTH_SERVICE_PORT';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName?: string;
  email: string;
  status: string;
}

export interface AuthServicePort {
  /** Returns null when no user has that email. */
  findUserByEmail(email: string): Promise<AuthUser | null>;
}
