import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserTokenRepositoryPort } from '@users/domain/repositories/user-token.repository.port';
import { UserTokenType } from '@users/domain/entities/user-token.entity';

interface ValidateTokenUseCaseResponse {
  valid: boolean;
  userId: number;
  tokenType: UserTokenType;
}

@Injectable()
export class ValidateTokenUseCase {
  constructor(private readonly userTokenRepository: UserTokenRepositoryPort) {}

  async execute(token: string): Promise<ValidateTokenUseCaseResponse> {
    const userToken = await this.userTokenRepository.findByToken(token);

    // We default to NOT valid and throw NOT_FOUND for any invalid case to avoid leaking information
    if (!userToken) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'El enlace no existe, expiró o ya se usó',
      });
    }

    if (userToken.usedAt) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'El enlace no existe, expiró o ya se usó',
      });
    }

    if (userToken.expiresAt < new Date()) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'El enlace no existe, expiró o ya se usó',
      });
    }

    return {
      valid: true,
      userId: userToken.userId,
      tokenType: userToken.type,
    };
  }
}
