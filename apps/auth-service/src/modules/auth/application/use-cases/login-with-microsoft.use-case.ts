import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { UserRepositoryPort } from '@users/domain/repositories/user.repository.port';
import { TokenRepositoryPort } from '@auth/domain/repositories/token.repository.port';
import { AuthTokens, TokenServicePort } from '@auth/application/ports/token.service.port';
import { LoginWithMicrosoftDto } from '../dto/login-with-microsoft.dto';
import { Token, TokenType } from '@auth/domain/entities/token.entity';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@users/domain/entities/user.entity';

@Injectable()
export class LoginWithMicrosoftUseCase {
    constructor(
        private readonly userRepository: UserRepositoryPort,
        private readonly tokenRepository: TokenRepositoryPort,
        private readonly tokenService: TokenServicePort,
        private readonly configService: ConfigService,
    ) { }

    async execute(dto: LoginWithMicrosoftDto): Promise<AuthTokens> {
        const payload = this.decodeToken(dto.token);
        this.validateClaims(payload);

        const email = payload.email || payload.upn || payload.unique_name;
        const oid = payload.oid;

        if (!email) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'El token de Microsoft no incluye el correo' });
        }

        let user = await this.userRepository.findByEmail(email);

        if (user) {
            if (!user.oid) {
                user.oid = oid;
                user.password = undefined;
                user.status = UserStatus.CONFIRMED;
                await this.userRepository.save(user);
            } else if (user.oid !== oid) {
                throw new RpcException({
                    code: status.PERMISSION_DENIED,
                    message: 'El correo del usuario está vinculado a otra cuenta de Microsoft',
                });
            }
        } else {
            const newUser = {
                id: 0, // ID will be set by the repository
                email,
                firstName: payload.name || '',
                lastName: '',
                oid,
                active: true,
                status: UserStatus.CONFIRMED,
            };
            // TODO: Use a dynamic role assignment strategy instead of hardcoding role ID
            await this.userRepository.createWithRoles(newUser, [3]); // Role "User"
            user = await this.userRepository.findByEmail(email);
        }

        if (user && !user.active) {
            throw new RpcException({
                code: status.PERMISSION_DENIED,
                message: 'La cuenta de este usuario está inactiva',
            });
        }

        const { accessToken, refreshToken } = await this.tokenService.generateTokens(user!);

        await this.tokenRepository.deleteByUserId(user!.id);

        const expiresInDays = this.configService.get<number>(
            'JWT_REFRESH_TOKEN_EXPIRATION_DAYS',
            7,
        );
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

        const refreshTokenEntity = new Token(
            randomUUID(),
            refreshToken,
            user!.id,
            TokenType.REFRESH_TOKEN,
            expiresAt,
        );
        await this.tokenRepository.save(refreshTokenEntity);

        return { accessToken, refreshToken };
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
