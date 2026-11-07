import { Injectable } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import {
  AuthServicePort,
  AuthUser,
} from '../../application/ports/auth-service.port';
import { AuthGrpcClient } from './auth.grpc-client';

@Injectable()
export class AuthServiceAdapter implements AuthServicePort {
  constructor(private readonly grpc: AuthGrpcClient) {}

  async findUserByEmail(email: string): Promise<AuthUser | null> {
    try {
      const user = await this.grpc.getUserByEmail(email);
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
