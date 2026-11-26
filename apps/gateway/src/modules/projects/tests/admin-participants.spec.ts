import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';
import { ProjectsController } from '../projects.controller';
import { AdminAddParticipantDto } from '../dto/admin-participant.dto';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';
import { ANY_PERMISSIONS_KEY } from '../../../common/decorators/require-any-permission.decorator';
import { GrpcExceptionFilter } from '../../../common/filters/grpc-exception.filter';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { ROUTE_POLICY } from '../../../common/authorization/route-policy';
import { AppUser } from '../../auth/types/app-user.type';

const handlerOf = (name: keyof ProjectsController) =>
  Object.getOwnPropertyDescriptor(ProjectsController.prototype, name)
    ?.value as object;

/** Body the exception filter writes for an error of the service */
const httpBody = (error: unknown) => {
  const json = jest.fn<void, [unknown]>();
  const response = { status: jest.fn(() => ({ json })) };
  const host = { switchToHttp: () => ({ getResponse: () => response }) };
  new GrpcExceptionFilter().catch(error, host as any);
  return { status: response.status, body: json.mock.calls[0]?.[0] };
};

const buildService = (responses: { add?: unknown; remove?: unknown }) => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const grpc = {
    adminAddParticipant: jest.fn(() => of(responses.add ?? {})),
    adminRemoveParticipant: jest.fn(() => of(responses.remove ?? {})),
  };
  Object.assign(service, { projectsService: grpc });
  return { service, grpc };
};

const dto = (body: Record<string, unknown>) =>
  plainToInstance(AdminAddParticipantDto, body);

const messages = async (body: Record<string, unknown>) =>
  (await validate(dto(body), { whitelist: true })).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

const PENDING_BODY = {
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@uni.edu',
  studentCode: '2021123456',
  semester: '6',
  career: 'ing_sistemas',
};

describe('Administrative participants endpoints', () => {
  it('require manage:projects and are in the route policy', () => {
    for (const name of [
      'adminAddParticipant',
      'adminRemoveParticipant',
      'adminRemovePendingParticipant',
    ] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf(name))).toEqual([
        'manage:projects',
      ]);
    }
    for (const key of [
      'POST /projects/:id/admin/participants',
      'DELETE /projects/:id/admin/participants/:userId',
      'DELETE /projects/:id/admin/participants/pending/:pendingId',
    ]) {
      expect(ROUTE_POLICY[key]).toEqual({ permission: ['manage:projects'] });
    }
  });

  describe('AdminAddParticipantDto', () => {
    it('accepts an enrolled participant (userId and studentCode)', async () => {
      expect(await messages({ userId: 42, studentCode: '2021' })).toEqual([]);
    });

    it('accepts a pending participant', async () => {
      expect(await messages({ ...PENDING_BODY, reason: 'Faltaba' })).toEqual(
        [],
      );
    });

    it('answers 400 in Spanish when a pending participant misses fields', async () => {
      const errors = await messages({ studentCode: '2021' });
      expect(errors).toEqual(
        expect.arrayContaining([
          'El nombre del integrante es obligatorio',
          'El formato del correo no es válido',
          'El semestre debe ser un número',
          'La carrera es obligatoria',
        ]),
      );
    });

    it('always requires the student code', async () => {
      expect(await messages({ userId: 42 })).toContain(
        'El código de estudiante es obligatorio',
      );
    });
  });

  describe('POST /projects/:id/admin/participants', () => {
    it('sends an enrolled participant without the pending fields', async () => {
      const { service, grpc } = buildService({
        add: {
          participant: { userId: 42, projectId: 4, studentCode: '2021' },
          failedEffects: [],
          warning: '',
        },
      });

      const result = await service.adminAddParticipant(
        4,
        dto({ userId: 42, studentCode: '2021', firstName: 'ignored' }),
        7,
      );

      expect(grpc.adminAddParticipant).toHaveBeenCalledWith({
        projectId: 4,
        actingUserId: 7,
        userId: 42,
        studentCode: '2021',
        pending: undefined,
        reason: '',
      });
      expect(result).toEqual({
        participant: { userId: 42, projectId: 4, studentCode: '2021' },
        pendingParticipant: null,
        failedEffects: [],
        warning: null,
      });
    });

    it('sends a pending participant and returns its status by name', async () => {
      const { service, grpc } = buildService({
        add: {
          pendingParticipant: { pendingId: 9, email: 'ana@uni.edu', status: 2 },
          failedEffects: [],
          warning: '',
        },
      });

      const result = await service.adminAddParticipant(
        4,
        dto({ ...PENDING_BODY, reason: 'Faltaba' }),
        7,
      );

      expect(grpc.adminAddParticipant).toHaveBeenCalledWith({
        projectId: 4,
        actingUserId: 7,
        userId: undefined,
        studentCode: undefined,
        pending: { ...PENDING_BODY },
        reason: 'Faltaba',
      });
      expect(result.pendingParticipant).toEqual({
        pendingId: 9,
        email: 'ana@uni.edu',
        status: 'INVITED',
      });
    });

    it('passes the warning when the invitation email failed', async () => {
      const warning =
        'El integrante se agregó, pero no se pudo enviar el correo de invitación; queda como pendiente sin invitar.';
      const { service } = buildService({
        add: {
          pendingParticipant: { pendingId: 9, status: 1 },
          failedEffects: ['NOTIFICATION'],
          warning,
        },
      });

      await expect(
        service.adminAddParticipant(4, dto(PENDING_BODY), 7),
      ).resolves.toMatchObject({
        pendingParticipant: { status: 'PENDING' },
        failedEffects: ['NOTIFICATION'],
        warning,
      });
    });

    it('answers 409 PARTICIPANT_HAS_ACTIVE_PROJECT with the other project in details', async () => {
      const message =
        'El estudiante ana@uni.edu ya participa en otro proyecto activo de este evento (proyecto 12). Quítalo de ese proyecto antes de agregarlo aquí.';
      const { service } = buildService({
        add: {
          rejected: {
            code: 'PARTICIPANT_HAS_ACTIVE_PROJECT',
            message,
            email: 'ana@uni.edu',
            _email: 'email',
            projectId: 12,
            _projectId: 'projectId',
          },
        },
      });

      const error = await service
        .adminAddParticipant(4, dto(PENDING_BODY), 7)
        .catch((e: unknown) => e);

      const { status, body } = httpBody(error);
      expect(status).toHaveBeenCalledWith(409);
      expect(body).toEqual({
        statusCode: 409,
        message,
        code: 'PARTICIPANT_HAS_ACTIVE_PROJECT',
        details: { email: 'ana@uni.edu', projectId: 12 },
        timestamp: expect.any(String) as unknown,
      });
    });
  });

  describe('DELETE /projects/:id/admin/participants', () => {
    it('removes an enrolled participant with the reason of the query', async () => {
      const { service, grpc } = buildService({ remove: {} });
      const controller = new ProjectsController(service);

      await expect(
        controller.adminRemoveParticipant(4, 42, { reason: 'Se retiró' }, {
          id: 7,
        } as AppUser),
      ).resolves.toBeUndefined();
      expect(grpc.adminRemoveParticipant).toHaveBeenCalledWith({
        projectId: 4,
        actingUserId: 7,
        userId: 42,
        reason: 'Se retiró',
      });
    });

    it('removes a pending participant by its id', async () => {
      const { service, grpc } = buildService({ remove: {} });
      const controller = new ProjectsController(service);

      await controller.adminRemovePendingParticipant(4, 9, {}, {
        id: 7,
      } as AppUser);
      expect(grpc.adminRemoveParticipant).toHaveBeenCalledWith({
        projectId: 4,
        actingUserId: 7,
        pendingId: 9,
        reason: '',
      });
    });

    it('answers 400 LAST_PARTICIPANT when the project would be left without participants', async () => {
      const message =
        'No se puede quitar al único integrante del proyecto. Agrega otro integrante antes de quitar este.';
      const { service } = buildService({
        remove: { rejected: { code: 'LAST_PARTICIPANT', message } },
      });

      const error = await service
        .adminRemoveParticipant(4, { userId: 42 }, undefined, 7)
        .catch((e: unknown) => e);

      const { status, body } = httpBody(error);
      expect(status).toHaveBeenCalledWith(400);
      expect(body).toMatchObject({
        message,
        code: 'LAST_PARTICIPANT',
        details: {},
      });
    });
  });
});

describe('PUT /projects/:id/tutors permissions', () => {
  const contextFor = (user: Partial<AppUser>) =>
    ({
      getHandler: () => handlerOf('setProjectTutors'),
      getClass: () => ProjectsController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  const guard = new PermissionsGuard(new Reflector());

  it('takes manage:events or manage:projects, as the route policy says', () => {
    expect(
      Reflect.getMetadata(ANY_PERMISSIONS_KEY, handlerOf('setProjectTutors')),
    ).toEqual(['manage:events', 'manage:projects']);
    expect(ROUTE_POLICY['PUT /projects/:id/tutors']).toEqual({
      anyPermission: ['manage:events', 'manage:projects'],
    });
  });

  it('lets in a user with manage:projects and without manage:events', () => {
    expect(
      guard.canActivate(
        contextFor({
          platformPermissions: ['manage:projects'],
          platformRoles: [],
        }),
      ),
    ).toBe(true);
  });

  it('lets in a user with manage:events only', () => {
    expect(
      guard.canActivate(
        contextFor({
          platformPermissions: ['manage:events'],
          platformRoles: [],
        }),
      ),
    ).toBe(true);
  });

  it('answers 403 to a user with neither', () => {
    expect(() =>
      guard.canActivate(
        contextFor({ platformPermissions: ['read:events'], platformRoles: [] }),
      ),
    ).toThrow(ForbiddenException);
  });
});
