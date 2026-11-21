import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  AUTH_SERVICE_NAME,
  AuthServiceClient,
  User,
  ActivateUserResponse,
  AssignPlatformRolesResponse,
  GetRolesByIdsResponse,
} from '@app/common/generated/auth';
import { AuthServicePort } from '../ports/auth-service.port';

@Injectable()
export class AuthServiceAdapter implements AuthServicePort, OnModuleInit {
  private authService: AuthServiceClient;

  constructor(
    @Inject(AUTH_SERVICE_NAME) private readonly authClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.authService =
      this.authClient.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
  }

  async generateAccountSetupToken(
    userId: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const response = await firstValueFrom(
      this.authService.generateAccountSetupToken({ userId }),
    );

    return {
      token: response.token,
      expiresAt: new Date(response.expiresAt), // Convert ISO string back to Date
    };
  }

  async getUserByEmail(email: string): Promise<User> {
    return await firstValueFrom(this.authService.getUserByEmail({ email }));
  }

  async getUser(id: number): Promise<User> {
    return await firstValueFrom(this.authService.getUser({ id }));
  }

  async createBasicUser(params: {
    email: string;
    firstName: string;
    lastName?: string;
    phone?: string;
  }): Promise<User> {
    return await firstValueFrom(this.authService.createBasicUser(params));
  }

  async updateUser(params: {
    id: number;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<User> {
    return await firstValueFrom(this.authService.updateUser(params));
  }

  async activateUser(params: {
    userId: number;
    password: string;
  }): Promise<ActivateUserResponse> {
    return await firstValueFrom(this.authService.activateUser(params));
  }

  async activateUserWithMicrosoft(params: {
    userId: number;
    token: string;
  }): Promise<ActivateUserResponse> {
    return await firstValueFrom(
      this.authService.activateUserWithMicrosoft(params),
    );
  }

  async assignPlatformRoles(params: {
    userId: number;
    roleIds: number[];
    actorUserId?: number;
  }): Promise<AssignPlatformRolesResponse> {
    return await firstValueFrom(this.authService.assignPlatformRoles(params));
  }

  async getUserPlatformAccess(
    userId: number,
  ): Promise<{ roleNames: string[]; permissions: string[] }> {
    const response = await firstValueFrom(
      this.authService.getUserPermissions({ userId }),
    );
    // proto3 leaves an empty repeated field out of the message
    return {
      roleNames: (response.roles ?? []).map((role) => role.name),
      permissions: response.permissions ?? [],
    };
  }

  async checkPlatformRoleGrant(params: {
    actorUserId: number;
    roleIds: number[];
  }): Promise<void> {
    await firstValueFrom(this.authService.checkPlatformRoleGrant(params));
  }

  async getRolesByIds(roleIds: number[]): Promise<GetRolesByIdsResponse> {
    return await firstValueFrom(
      this.authService.getRolesByIds({ roleIds }),
    );
  }
}
