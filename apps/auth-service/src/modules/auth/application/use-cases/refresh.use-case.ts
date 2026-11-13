import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { TokenRepositoryPort } from '@auth/domain/repositories/token.repository.port';
import { TokenServicePort } from '@auth/application/ports/token.service.port';
import { RefreshDto } from '@auth/application/dto/refresh.dto';
import { User } from '@users/domain/entities/user.entity';

@Injectable()
export class RefreshUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenRepository: TokenRepositoryPort,
    private readonly tokenService: TokenServicePort,
  ) {}

  async execute(refreshDto: RefreshDto): Promise<{ accessToken: string }> {
    const { refreshToken } = refreshDto;

    // TODO: When hashing is implemented, this should find the token by its raw value,
    // and then the verification would be a hash comparison.
    const storedToken = await this.tokenRepository.findByToken(refreshToken);

    if (
      !storedToken ||
      storedToken.expiresAt < new Date() ||
      storedToken.usedAt
    ) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'La sesión no es válida o expiró; inicia sesión de nuevo',
      });
    }

    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken);

    const user = await this.userRepository.findById(userId);

    if (!user || !user.active) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'No se encontró el usuario o la cuenta está inactiva',
      });
    }

    const { accessToken } = await this.tokenService.generateTokens(user);

    // TODO: Implement Refresh Token Rotations

    return { accessToken };
  }
}
