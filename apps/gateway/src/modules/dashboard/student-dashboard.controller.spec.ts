import { INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CacheService } from '../../common/cache/cache.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator';
import { StudentDashboardController } from './student-dashboard.controller';
import { StudentDashboardService } from './student-dashboard.service';

const SECRET = 'student-dashboard-spec-secret';

/** Same contract as the real JwtStrategy: the session user ends up in request.user */
@Injectable()
class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: SECRET,
    });
  }

  validate(payload: { sub: number }) {
    // A plain student: no platform role with permissions
    return {
      id: payload.sub,
      platformRoles: [{ id: 2, name: 'User', scope: 'PLATFORM' }],
      platformPermissions: [],
    };
  }
}

describe('StudentDashboardController (access)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const service = { getDashboard: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: [StudentDashboardController],
      providers: [
        TestJwtStrategy,
        { provide: StudentDashboardService, useValue: service },
        { provide: CacheService, useValue: {} },
        // Same global guards, in the same order, as AppModule
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.getDashboard
      .mockReset()
      .mockResolvedValue({ kpis: { totalFairs: 0 } });
  });

  const server = () => app.getHttpServer() as App;
  const tokenFor = (userId: number) => `Bearer ${jwt.sign({ sub: userId })}`;

  it('requires a session (401 without token)', async () => {
    await request(server()).get('/students/me/dashboard').expect(401);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    await request(server())
      .get('/students/me/dashboard')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it('lets a student without platform permissions read their own dashboard', async () => {
    const res = await request(server())
      .get('/students/me/dashboard')
      .set('Authorization', tokenFor(7))
      .expect(200);

    expect(res.body).toEqual({ kpis: { totalFairs: 0 } });
    expect(service.getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    );
  });

  it('always uses the session user, never an id sent in the request', async () => {
    await request(server())
      .get('/students/me/dashboard?userId=99&id=99')
      .set('Authorization', tokenFor(7))
      .expect(200);

    expect(service.getDashboard).toHaveBeenCalledTimes(1);
    expect(service.getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    );
  });

  it('does not expose a route that takes another user id', async () => {
    await request(server())
      .get('/students/99/dashboard')
      .set('Authorization', tokenFor(7))
      .expect(404);
    expect(service.getDashboard).not.toHaveBeenCalled();
  });

  it('is a session endpoint: not public and without a required permission', () => {
    const reflector = new Reflector();
    const handler = Object.getOwnPropertyDescriptor(
      StudentDashboardController.prototype,
      'getMyDashboard',
    )?.value as (...args: unknown[]) => unknown;
    const targets = [handler, StudentDashboardController];

    expect(reflector.getAllAndOverride(IS_PUBLIC_KEY, targets)).toBeUndefined();
    expect(
      reflector.getAllAndOverride(PERMISSIONS_KEY, targets),
    ).toBeUndefined();
  });
});
