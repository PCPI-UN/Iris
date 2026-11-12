import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import {
  AuthServicePort,
  AuthUser,
} from '../../application/ports/auth-service.port';
import { User } from '@app/common/generated/auth';
import { AuthGrpcClient } from './auth.grpc-client';

const LOOKUP_BATCH = 10;

@Injectable()
export class AuthServiceAdapter implements AuthServicePort {
  constructor(private readonly grpc: AuthGrpcClient) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    return this.orNull(() => this.grpc.getUserByEmail(email));
  }

  /** One GetUser per id, in batches of LOOKUP_BATCH so a large event does not flood auth-service */
  async findUsersByIds(ids: number[]): Promise<AuthUser[]> {
    const unique = [...new Set(ids)];
    const found: AuthUser[] = [];
    for (let i = 0; i < unique.length; i += LOOKUP_BATCH) {
      const batch = unique.slice(i, i + LOOKUP_BATCH);
      const users = await Promise.all(
        batch.map((id) => this.orNull(() => this.grpc.getUser(id))),
      );
      found.push(...users.filter((user): user is AuthUser => user !== null));
    }
    return found;
  }

  private async orNull(call: () => Promise<User>): Promise<AuthUser | null> {
    try {
      const user = await call();
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        status: user.status,
      };
    } catch (error) {
      if ((error as { code?: number })?.code === status.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }
}
