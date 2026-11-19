import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { UserTokenRepositoryPort } from '@users/domain/repositories/user-token.repository.port';
import { EmailServicePort } from '@common/ports/email-service.port';
import {
  UserToken,
  UserTokenType,
} from '@users/domain/entities/user-token.entity';

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepositoryPort,
    private readonly tokenRepository: UserTokenRepositoryPort,
    private readonly emailService: EmailServicePort,
  ) {}

  async execute(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findByEmail(email);

    const genericResponse = {
      success: true,
      message:
        'Si existe una cuenta con este correo, se envió un enlace para restablecer la contraseña.',
    };

    if (!user || !user.active || user.status === 'PENDING') {
      return genericResponse;
    }

    const token = randomBytes(32).toString('hex');

    const expiryMinutes =
      this.configService.get<number>('PASSWORD_RESET_TOKEN_EXPIRY_MINUTES') ||
      60;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const userToken = new UserToken(
      randomUUID(),
      token,
      user.id,
      UserTokenType.RESET_PASSWORD,
      expiresAt,
      null,
    );

    await this.tokenRepository.save(userToken);
    await this.emailService.sendPasswordResetEmail(email, token, expiryMinutes);

    return genericResponse;
  }
}
