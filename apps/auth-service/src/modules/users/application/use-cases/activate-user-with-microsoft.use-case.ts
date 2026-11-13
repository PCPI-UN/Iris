import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '../../domain/repositories/user.repository.port';
import { ActivateUserWithMicrosoftDto } from '../dto/activate-user-with-microsoft.dto';
import { ActivateUserResponse } from '@app/common/generated/auth';
import { UserStatus } from '../../domain/entities/user.entity';
import { UserTokenRepositoryPort } from '../../domain/repositories/user-token.repository.port';
import { normalizeEmail } from '@app/common/utils/email.util';

@Injectable()
export class ActivateUserWithMicrosoftUseCase {
    constructor(
        private readonly userRepository: UserRepositoryPort,
        private readonly userTokenRepository: UserTokenRepositoryPort,
    ) { }

    async execute(dto: ActivateUserWithMicrosoftDto): Promise<ActivateUserResponse> {
        const payload = this.decodeToken(dto.token);
        this.validateClaims(payload);

        const email = payload.email || payload.upn || payload.unique_name;
        const oid = payload.oid;

        if (!email) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'El token de Microsoft no incluye el correo' });
        }

        const user = await this.userRepository.findById(dto.userId);

        if (!user) {
            throw new RpcException({
                code: status.NOT_FOUND,
                message: 'No se encontró el usuario',
            });
        }

        // Security check: Ensure the Microsoft email matches the invited user's email
        if (normalizeEmail(user.email) !== normalizeEmail(email)) {
            throw new RpcException({
                code: status.PERMISSION_DENIED,
                message: 'El correo de la cuenta de Microsoft no coincide con el correo invitado',
            });
        }

        user.oid = oid;
        user.status = UserStatus.CONFIRMED;

        await this.userRepository.save(user);

        // Mark all ACCOUNT_SETUP tokens as used for this user
        await this.userTokenRepository.markAllAccountSetupTokensAsUsedForUser(dto.userId);

        return { success: true };
    }

    private decodeToken(token: string): any {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('El formato del token no es válido');
            const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
            return JSON.parse(payload);
        } catch (e) {
            throw new RpcException({
                code: status.INVALID_ARGUMENT,
                message: 'El token de Microsoft no es válido',
            });
        }
    }

    private validateClaims(payload: any): void {
        const email = payload.email || payload.upn || payload.unique_name;
        if (!email || !email.endsWith('@uninorte.edu.co')) {
            throw new RpcException({
                code: status.PERMISSION_DENIED,
                message: 'Solo se permiten cuentas uninorte.edu.co',
            });
        }
    }
}
