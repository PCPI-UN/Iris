import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { PasswordHasherPort } from '@common/ports/password-hasher.port';
import { EmailServicePort } from '@common/ports/email-service.port';
import { TokenRepositoryPort } from '@auth/domain/repositories/token.repository.port';


@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly emailService: EmailServicePort,
    private readonly tokenRepository: TokenRepositoryPort,
  ) { }

  async execute(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findById(userId);

    if (!user || !user.active || user.status === 'PENDING') {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró el usuario o está inactivo',
      });
    }

    if (!user.password) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'El usuario no tiene una contraseña configurada',
      });
    }

    const isValid = await this.passwordHasher.compare(
      oldPassword,
      user.password,
    );

    if (!isValid) {
      throw new RpcException({
        code: status.PERMISSION_DENIED,
        message: 'La contraseña actual es incorrecta',
      });
    }

    const hashedPassword = await this.passwordHasher.hash(newPassword);

    user.password = hashedPassword;
    await this.userRepository.save(user);

    // This forces a re-authentication by deleting all existing tokens
    await this.tokenRepository.deleteByUserId(userId);

    await this.emailService.sendPasswordChangeConfirmation(
      user.email,
      user.firstName,
    );

    return {
      success: true,
      message: 'Password changed successfully',
    };
  }
}
