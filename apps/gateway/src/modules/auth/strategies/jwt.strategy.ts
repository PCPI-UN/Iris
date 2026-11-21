import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { ConfigService } from '@nestjs/config';
import { AppUser } from '../types/app-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    const publicKey = Buffer.from(
      configService.get<string>('JWT_PUBLIC_KEY', ''),
      'base64',
    ).toString('ascii');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.['access_token'];
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: any): Promise<AppUser> {
    if (!payload.sub) {
      this.logger.warn('Invalid token payload: missing subject');
      throw new UnauthorizedException('El contenido del token no es válido');
    }

    this.logger.debug(`Validating user with ID: ${payload.sub}`);
    try {
      const user = await this.authService.getUser(payload.sub);
      if (!user) {
        this.logger.warn(`User not found with ID: ${payload.sub}`);
        throw new UnauthorizedException('No se encontró el usuario');
      }

      // A deactivated account loses its session on the next request, not when the token expires
      if (!user.active) {
        this.logger.warn(`Inactive user with ID: ${payload.sub}`);
        throw new UnauthorizedException('El usuario está inactivo');
      }

      const permissionsResponse =
        await this.authService.getUserPermissions(payload.sub);

      
      const appUser: AppUser = {
        id: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
        phone: user.phone || '',
        active: user.active,
        status: user.status,
        platformRoles: permissionsResponse.roles || [],
        platformPermissions: permissionsResponse.permissions || [],
      };
      this.logger.debug(`User validated: ${JSON.stringify(appUser)}`);
      return appUser;
    } catch (e) {
      throw new UnauthorizedException('No se pudo validar el usuario');
    }
  }
}
