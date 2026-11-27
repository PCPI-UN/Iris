import { INestApplication, Injectable } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { of, throwError } from 'rxjs';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { ProjectAccessAction } from '@app/common/generated/project';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { GrpcExceptionFilter } from '../../../common/filters/grpc-exception.filter';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ROUTE_POLICY } from '../../../common/authorization/route-policy';
import { ProjectsController } from '../projects.controller';
import { ProjectsService } from '../projects.service';

const SECRET = 'add-project-documents-spec-secret';

const PROJECT_ID = 4;
const MEMBER_ID = 5; // confirmed participant of project 4
const EVENT_MANAGER_ID = 9; // has manage:events
const STRANGER_ID = 11; // has a session, not in the project

const NO_ACCESS =
  'Solo los participantes del proyecto o quien administra eventos pueden modificarlo';

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
    return {
      id: payload.sub,
      platformRoles: [{ id: 2, name: 'User', scope: 'PLATFORM' }],
      platformPermissions:
        payload.sub === EVENT_MANAGER_ID ? ['manage:events'] : [],
    };
  }
}

const buildService = () => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const grpc = {
    // project-service decides: participants or manage:events may edit
    checkProjectAccess: jest.fn(({ userId }: { userId: number }) =>
      userId === MEMBER_ID || userId === EVENT_MANAGER_ID
        ? of({ projectId: PROJECT_ID })
        : throwError(() => ({
            code: GrpcStatus.PERMISSION_DENIED,
            details: NO_ACCESS,
          })),
    ),
    getProject: jest.fn(() => of({ project: { id: PROJECT_ID, eventId: 2 } })),
    addProjectDocumentFromUrl: jest.fn(() => of({})),
  };
  const events = {
    getEvent: jest.fn(() =>
      of({
        event: {
          id: 2,
          evaluationsOpened: false,
          endDate: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }),
    ),
  };
  const blob = {
    uploadFile: jest.fn().mockResolvedValue({ blobName: '1800-poster.pdf' }),
  };
  Object.assign(service, {
    projectsService: grpc,
    eventsService: events,
    azureBlobUploadService: blob,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    // The gRPC clients above replace the ones onModuleInit would create
    onModuleInit: () => undefined,
  });
  return { service, grpc, blob };
};

describe('POST /projects/:projectId/documents (access)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let mocks: ReturnType<typeof buildService>;

  beforeAll(async () => {
    mocks = buildService();
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRET })],
      controllers: [ProjectsController],
      providers: [
        TestJwtStrategy,
        { provide: ProjectsService, useValue: mocks.service },
        // Same global guards, in the same order, as AppModule
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new GrpcExceptionFilter());
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const server = () => app.getHttpServer() as App;
  const tokenFor = (userId: number) => `Bearer ${jwt.sign({ sub: userId })}`;
  const upload = (authorization?: string) => {
    const req = request(server()).post(`/projects/${PROJECT_ID}/documents`);
    if (authorization) req.set('Authorization', authorization);
    return req
      .field('documents', JSON.stringify([{ type: 'POSTER' }]))
      .attach('files', Buffer.from('%PDF-1.4'), {
        filename: 'poster.pdf',
        contentType: 'application/pdf',
      });
  };

  it('is not public and the route policy checks the project access', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ProjectsController.prototype,
      'addProjectDocuments',
    )?.value as (...args: unknown[]) => unknown;
    expect(
      new Reflector().getAllAndOverride(IS_PUBLIC_KEY, [
        handler,
        ProjectsController,
      ]),
    ).toBeUndefined();
    expect(ROUTE_POLICY['POST /projects/:projectId/documents']).toMatchObject({
      access: 'owner',
    });
  });

  it('answers 401 without a session and uploads nothing', async () => {
    await upload().expect(401);
    expect(mocks.grpc.checkProjectAccess).not.toHaveBeenCalled();
    expect(mocks.blob.uploadFile).not.toHaveBeenCalled();
  });

  it('answers 403 to a user who is not in the project, before any upload', async () => {
    const res = await upload(tokenFor(STRANGER_ID)).expect(403);

    expect(JSON.stringify(res.body)).toContain(NO_ACCESS);
    expect(mocks.grpc.checkProjectAccess).toHaveBeenCalledWith({
      userId: STRANGER_ID,
      action: ProjectAccessAction.PROJECT_ACCESS_EDIT,
      projectId: PROJECT_ID,
      documentId: 0,
    });
    expect(mocks.blob.uploadFile).not.toHaveBeenCalled();
    expect(mocks.grpc.addProjectDocumentFromUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['a confirmed participant', MEMBER_ID],
    ['a user with manage:events', EVENT_MANAGER_ID],
  ])('lets %s upload (201)', async (_label, userId) => {
    const res = await upload(tokenFor(userId)).expect(201);

    expect(res.body).toEqual({
      message: 'Archivos agregados al proyecto correctamente',
      success: true,
    });
    expect(mocks.grpc.checkProjectAccess).toHaveBeenCalledWith({
      userId,
      action: ProjectAccessAction.PROJECT_ACCESS_EDIT,
      projectId: PROJECT_ID,
      documentId: 0,
    });
    expect(mocks.blob.uploadFile).toHaveBeenCalledTimes(1);
    expect(mocks.grpc.addProjectDocumentFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        url: '1800-poster.pdf',
      }),
    );
  });
});
