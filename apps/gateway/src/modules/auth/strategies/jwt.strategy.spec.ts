import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const authService = {
    getUser: jest.fn(),
    getUserPermissions: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue(Buffer.from('test-key').toString('base64')),
  };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    authService.getUserPermissions.mockResolvedValue({
      roles: [{ id: 2, name: 'EventManager' }],
      permissions: ['manage:events'],
    });
    strategy = new JwtStrategy(
      authService as unknown as AuthService,
      configService as unknown as ConfigService,
    );
  });

  it('returns the user with their permissions when the account is active', async () => {
    authService.getUser.mockResolvedValue({
      id: 12,
      email: 'a@uni.edu',
      active: true,
    });

    const user = await strategy.validate({ sub: 12 });

    expect(user.id).toBe(12);
    expect(user.platformPermissions).toEqual(['manage:events']);
  });

  it('rejects the session of a deactivated account that still holds a valid token', async () => {
    authService.getUser.mockResolvedValue({
      id: 12,
      email: 'a@uni.edu',
      active: false,
    });

    await expect(strategy.validate({ sub: 12 })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.getUserPermissions).not.toHaveBeenCalled();
  });
});
