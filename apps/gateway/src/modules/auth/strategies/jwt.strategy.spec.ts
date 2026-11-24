import { Logger, UnauthorizedException } from '@nestjs/common';
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
    jest.restoreAllMocks();
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

  it('logs only the user id, never their personal data or permissions', async () => {
    authService.getUser.mockResolvedValue({
      id: 12,
      firstName: 'Ana',
      email: 'a@uni.edu',
      phone: '3001234567',
      active: true,
    });
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);

    await strategy.validate({ sub: 12 });

    const logged = debug.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('12');
    expect(logged).not.toContain('a@uni.edu');
    expect(logged).not.toContain('3001234567');
    expect(logged).not.toContain('Ana');
    expect(logged).not.toContain('manage:events');
    expect(logged).not.toContain('EventManager');
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
