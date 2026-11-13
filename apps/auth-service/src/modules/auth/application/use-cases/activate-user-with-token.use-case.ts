import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { UserTokenRepositoryPort } from '@users/domain/repositories/user-token.repository.port';
import { UserStatus } from '@users/domain/entities/user.entity';
import { UserTokenType } from '@users/domain/entities/user-token.entity';
import { ValidateTokenUseCase } from '@auth/application/use-cases/validate-token.use-case';
import { ValidateTokenDto } from '../dto/validate-token.dto';

@Injectable()
export class ActivateUserWithTokenUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly userTokenRepository: UserTokenRepositoryPort,
    private readonly validateTokenUseCase: ValidateTokenUseCase,
  ) {}

  async execute(validateTokenDto: ValidateTokenDto): Promise<{ success: boolean }> {
    // DRY: Duplicate code for generating account setup token and sending email
    // TODO: refactor into a shared service to avoid depending on another use case
    const { valid, userId, tokenType } = await this.validateTokenUseCase.execute(
      validateTokenDto.token,
    );

    if (!valid || tokenType !== UserTokenType.ACCOUNT_SETUP) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'El enlace no es válido para confirmar la cuenta',
      });
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró el usuario',
      });
    }

    if (user.status === UserStatus.CONFIRMED) {
      return { success: true };
    }

    user.status = UserStatus.CONFIRMED;
    await this.userRepository.save(user);

    await this.userTokenRepository.markAllAccountSetupTokensAsUsedForUser(
      userId,
    );

    return { success: true };
  }
}