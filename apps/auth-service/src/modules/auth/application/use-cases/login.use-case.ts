import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { TokenRepositoryPort } from '@auth/domain/repositories/token.repository.port';
import { AuthTokens, TokenServicePort } from '@auth/application/ports/token.service.port';
import { LoginDto } from '@auth/application/dto/login.dto';
import { Token, TokenType } from '@auth/domain/entities/token.entity';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokenRepository: TokenRepositoryPort,
    private readonly tokenService: TokenServicePort,
    private readonly configService: ConfigService,
  ) { }

  async execute(loginDto: LoginDto): Promise<AuthTokens> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No existe un usuario con el correo indicado',
      });
    }

    if (!user.active) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'La cuenta de este usuario está inactiva',
      });
    }

    if (!user.password) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Las credenciales no son válidas',
      });
    }

    if (user.status !== 'CONFIRMED') {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'La cuenta no está confirmada; revisa tu correo',
      });
    }

    const isPasswordValid = await this.passwordHasher.compare(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Las credenciales no son válidas',
      });
    }

    const { accessToken, refreshToken } = await this.tokenService.generateTokens(
      user,
    );

    await this.tokenRepository.deleteByUserId(user.id);

    const expiresInDays = this.configService.get<number>(
      'JWT_REFRESH_TOKEN_EXPIRATION_DAYS',
      7, // Default to 7 days
    );
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const refreshTokenEntity = new Token(
      randomUUID(),
      // TODO: Hash the refresh token before storing it.
      refreshToken,
      user.id,
      TokenType.REFRESH_TOKEN,
      expiresAt,
    );
    await this.tokenRepository.save(refreshTokenEntity);

    return { accessToken, refreshToken };
  }
}
