import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_SERVICE_NAME,
  AuthServiceClient,
  User,
  FindUsersByRolesRequest,
  UserSummary,
} from '@app/common/generated/auth';

@Injectable()
export class AuthGrpcClient implements OnModuleInit {
  private svc: AuthServiceClient;

  constructor(@Inject(AUTH_SERVICE_NAME) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
  }

  async getUserByEmail(email: string): Promise<User> {
    return firstValueFrom(this.svc.getUserByEmail({ email }));
  }

  async getUser(id: number): Promise<User> {
    return firstValueFrom(this.svc.getUser({ id }));
  }

  async findUsersByRoles(request: FindUsersByRolesRequest): Promise<UserSummary[]> {
    const res = await firstValueFrom(this.svc.findUsersByRoles(request));
    // proto3 leaves an empty repeated field out of the message
    return res.users ?? [];
  }

  async assignPlatformRoles(userId: number, roleIds: number[]): Promise<void> {
    await firstValueFrom(this.svc.assignPlatformRoles({ userId, roleIds }));
  }
}
