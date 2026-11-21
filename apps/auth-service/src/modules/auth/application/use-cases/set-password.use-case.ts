import { Injectable } from '@nestjs/common';
import { ValidateTokenUseCase } from './validate-token.use-case';
import { SetPasswordDto } from '@auth/application/dto/set-password.dto';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { TokenRepositoryPort } from '@auth/domain/repositories/token.repository.port';
import { UserTokenRepositoryPort } from '@users/domain/repositories/user-token.repository.port';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserStatus } from '@users/domain/entities/user.entity';
import { UserTokenType } from '@users/domain/entities/user-token.entity';

@Injectable()
export class SetPasswordUseCase {
  constructor(
    private readonly validateTokenUseCase: ValidateTokenUseCase,
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly userTokenRepository: UserTokenRepositoryPort,
    private readonly tokenRepository: TokenRepositoryPort,
  ) {}

  async execute(setPasswordDto: SetPasswordDto): Promise<{ success: boolean }> {
    const { token, password } = setPasswordDto;

    const { userId, tokenType } = await this.validateTokenUseCase.execute(token);

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró el usuario',
      });
    }

    const hashedPassword = await this.passwordHasher.hash(password);
    user.password = hashedPassword;

    // We only set status to CONFIRMED for ACCOUNT_SETUP tokens
    if (tokenType === UserTokenType.ACCOUNT_SETUP) {
      user.status = UserStatus.CONFIRMED;
    }

    await this.userRepository.save(user);
    
    // Mark token as used instead of deleting it
    await this.userTokenRepository.markAsUsed(token);

    // Once the auth token is marked as used, we are going to mark as 'used' all other tokens
    // if the token type is RESET_PASSWORD. This is logical, if the user just reset their password,
    // there might be other devices with valid tokens that must be logged out.

    if (tokenType === UserTokenType.RESET_PASSWORD) {
      await this.tokenRepository.deleteByUserId(userId);
    }


    return { success: true };
  }
}
