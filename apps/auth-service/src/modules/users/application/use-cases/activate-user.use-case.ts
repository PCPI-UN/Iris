import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { Injectable } from '@nestjs/common';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { ActivateUserDto } from '../dto/activate-user.dto';
import { UserStatus } from '@users/domain/entities/user.entity';
import { UserTokenRepositoryPort } from '@users/domain/repositories/user-token.repository.port';

@Injectable()
export class ActivateUserUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly userTokenRepository: UserTokenRepositoryPort,
  ) {}

  async execute(activateUserDto: ActivateUserDto): Promise<{ success: boolean }> {
    const { userId, password } = activateUserDto;

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró el usuario',
      });
    }

    if (user.status !== UserStatus.PENDING) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: 'El usuario no está pendiente de activación',
      });
    }

    user.password = await this.passwordHasher.hash(password);
    user.status = UserStatus.CONFIRMED;

    await this.userRepository.save(user);

    // Mark all ACCOUNT_SETUP tokens as used for this user
    await this.userTokenRepository.markAllAccountSetupTokensAsUsedForUser(userId);

    return { success: true };
  }
}
