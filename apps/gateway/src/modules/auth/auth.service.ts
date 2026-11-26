import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import * as qs from 'qs';
import {
  AuthServiceClient,
  AUTH_SERVICE_NAME,
  LoginRequest,
  SignupRequest,
  ActivateUserWithTokenRequest,
  RefreshRequest,
  GetUserRequest,
  ValidateTokenRequest,
  GetUserPermissionsRequest,
  ForgotPasswordRequest,
  SetPasswordRequest,
  ChangePasswordRequest,
  UpdateOwnProfileRequest,
  LoginResponse,
  SignupResponse,
  RefreshResponse,
  ValidateTokenResponse,
  GetUserPermissionsResponse,
  ForgotPasswordResponse,
  SetPasswordResponse,
  ChangePasswordResponse,
  ActivateUserResponse,
  User,
  FindUsersByRolesRequest,
  FindUsersByRolesResponse,
} from '@app/common/generated/auth';
import { LoginDto } from './dto/login.dto';
import { ActivateUserDto } from './dto/activate-user.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private authService: AuthServiceClient;

  constructor(
    @Inject(AUTH_SERVICE_NAME) private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
  ) { }

  private tenantId: string;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  onModuleInit() {
    this.authService =
      this.client.getService<AuthServiceClient>(AUTH_SERVICE_NAME);

    this.tenantId = this.configService.get<string>('AZURE_TENANT_ID') || '';
    this.clientId = this.configService.get<string>('AZURE_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET') || '';
    this.redirectUri = this.configService.get<string>('REDIRECT_URI') || 'http://localhost:3000/auth/callback/microsoft';
  }

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    return firstValueFrom(this.authService.login(loginDto as LoginRequest));
  }

  async loginWithMicrosoft(token: string): Promise<LoginResponse> {
    return firstValueFrom(
      this.authService.loginWithMicrosoft({ token }),
    );
  }

  async signup(signupDto: SignupRequest): Promise<SignupResponse> {
    return firstValueFrom(
      this.authService.signup(signupDto as SignupRequest),
    );
  }

  async activateUserWithToken(activateUserDto: ActivateUserDto): Promise<ActivateUserResponse> {
    return firstValueFrom(
      this.authService.activateUserWithToken(activateUserDto as ActivateUserWithTokenRequest),
    );
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return firstValueFrom(
      this.authService.refresh({ refreshToken } as RefreshRequest),
    );
  }

  async validateToken(token: string): Promise<ValidateTokenResponse> {
    return firstValueFrom(
      this.authService.validateToken({ token } as ValidateTokenRequest),
    );
  }

  async getUser(id: number): Promise<User> {
    return firstValueFrom(this.authService.getUser({ id } as GetUserRequest));
  }

  async getUserPermissions(
    userId: number,
  ): Promise<GetUserPermissionsResponse> {
    return firstValueFrom(
      this.authService.getUserPermissions({
        userId,
      } as GetUserPermissionsRequest),
    );
  }

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    return firstValueFrom(
      this.authService.forgotPassword({ email } as ForgotPasswordRequest),
    );
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<SetPasswordResponse> {
    return firstValueFrom(
      this.authService.setPassword({ token, password } as SetPasswordRequest),
    );
  }

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResponse> {
    return firstValueFrom(
      this.authService.changePassword({
        userId,
        oldPassword,
        newPassword,
      } as ChangePasswordRequest),
    );
  }

  async findUsersByRoles(
    request: FindUsersByRolesRequest,
  ): Promise<FindUsersByRolesResponse> {
    return firstValueFrom(this.authService.findUsersByRoles(request));
  }

  async updateOwnProfile(request: UpdateOwnProfileRequest): Promise<User> {
    return firstValueFrom(this.authService.updateOwnProfile(request));
  }

  getAuthorizeUrl(invitationToken?: string, redirectUrl?: string): string {
    // We use the 'state' parameter to pass the invitation token through the OAuth flow.
    // This ensures that when the user returns from Microsoft, we know they were trying to accept an invitation.
    const state = invitationToken ? `invitation:${invitationToken}` : 'login';

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state: redirectUrl || state,
      prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string) {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const data = {
      client_id: this.clientId,
      scope: 'openid profile email',
      code,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      client_secret: this.clientSecret,
    };

    const res = await axios.post(tokenEndpoint, qs.stringify(data), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return res.data;
  }
}
