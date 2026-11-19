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
import { StudentResultsController } from './student-results.controller';
import { StudentResultsService } from './student-results.service';

const SECRET = 'student-results-spec-secret';

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

describe('StudentResultsController (access)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const service = { getMyResults: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: [StudentResultsController],
      providers: [
        TestJwtStrategy,
        { provide: StudentResultsService, useValue: service },
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
    service.getMyResults
      .mockReset()
      .mockResolvedValue({ resultsPublished: false });
  });

  const server = () => app.getHttpServer() as App;
  const tokenFor = (userId: number) => `Bearer ${jwt.sign({ sub: userId })}`;

  it('requires a session (401 without token)', async () => {
    await request(server()).get('/events/3/my-project/results').expect(401);
    expect(service.getMyResults).not.toHaveBeenCalled();
  });

  it('lets a student without platform permissions read their own results', async () => {
    const res = await request(server())
      .get('/events/3/my-project/results')
      .set('Authorization', tokenFor(7))
      .expect(200);

    expect(res.body).toEqual({ resultsPublished: false });
    expect(service.getMyResults).toHaveBeenCalledWith(7, 3);
  });

  it('always uses the session user, never an id sent in the request', async () => {
    await request(server())
      .get('/events/3/my-project/results?userId=99&projectId=99')
      .set('Authorization', tokenFor(7))
      .expect(200);

    expect(service.getMyResults).toHaveBeenCalledWith(7, 3);
  });

  it('rejects an event id that is not a number', async () => {
    await request(server())
      .get('/events/abc/my-project/results')
      .set('Authorization', tokenFor(7))
      .expect(400);
    expect(service.getMyResults).not.toHaveBeenCalled();
  });

  it('is a session endpoint: not public and without a required permission', () => {
    const reflector = new Reflector();
    const handler = Object.getOwnPropertyDescriptor(
      StudentResultsController.prototype,
      'getMyResults',
    )?.value as (...args: unknown[]) => unknown;
    const targets = [handler, StudentResultsController];

    expect(reflector.getAllAndOverride(IS_PUBLIC_KEY, targets)).toBeUndefined();
    expect(
      reflector.getAllAndOverride(PERMISSIONS_KEY, targets),
    ).toBeUndefined();
  });
});
