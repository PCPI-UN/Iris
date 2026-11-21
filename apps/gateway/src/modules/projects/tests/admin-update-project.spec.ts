import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import {
  ProjectsService,
  PROJECT_CATEGORY_CHANGE_BLOCKED,
  PROJECT_NAME_TAKEN,
} from '../projects.service';
import { ProjectsController } from '../projects.controller';
import { AdminUpdateProjectDto } from '../dto/admin-update-project.dto';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';
import { GrpcExceptionFilter } from '../../../common/filters/grpc-exception.filter';
import { ROUTE_POLICY } from '../../../common/authorization/route-policy';

describe('PATCH /projects/:id/admin', () => {
  const buildService = (response: unknown) => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    const grpc = { adminUpdateProject: jest.fn(() => of(response)) };
    Object.assign(service, { projectsService: grpc });
    return { service, grpc };
  };

  const dto = (body: Record<string, unknown>) =>
    plainToInstance(AdminUpdateProjectDto, body);

  const messages = async (body: Record<string, unknown>) =>
    (await validate(dto(body), { whitelist: true })).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  /** Body the exception filter writes for an error of the service */
  const httpBody = (error: unknown) => {
    const json = jest.fn<void, [unknown]>();
    const response = { status: jest.fn(() => ({ json })) };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GrpcExceptionFilter().catch(error, host as any);
    return { status: response.status, body: json.mock.calls[0]?.[0] };
  };

  it('requires manage:projects (403 without it) and is in the route policy', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ProjectsController.prototype,
      'adminUpdateProject',
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'manage:projects',
    ]);
    expect(ROUTE_POLICY['PATCH /projects/:id/admin']).toEqual({
      permission: ['manage:projects'],
    });
  });

  it('accepts a partial body with the editable fields, the reason and force', async () => {
    expect(
      await messages({
        name: 'Robot clasificador',
        description: '',
        projectCode: null,
        eventNumber: '17',
        courseId: 5,
        reason: 'Categoría equivocada',
        force: true,
      }),
    ).toEqual([]);
  });

  it('answers 400 in Spanish for invalid values', async () => {
    expect(await messages({ name: '   ' })).toContain(
      'El nombre del proyecto no puede estar vacío',
    );
    expect(await messages({ courseId: 'abc' })).toContain(
      'La categoría debe ser un número entero',
    );
    expect(await messages({ projectCode: 'x'.repeat(51) })).toContain(
      'El código del proyecto no puede superar 50 caracteres',
    );
    expect(await messages({ force: 'yes' })).toContain(
      'force debe ser verdadero o falso',
    );
  });

  it('drops a state sent in the body, so it never reaches project-service', async () => {
    const { service, grpc } = buildService({ project: { id: 4 } });
    const body = dto({ name: 'Dron', state: 'REJECTED' });

    await service.adminUpdateProject(4, body, 7);

    expect(grpc.adminUpdateProject).toHaveBeenCalledWith(
      expect.not.objectContaining({ state: expect.anything() as unknown }),
    );
  });

  it('answers 400 without calling project-service when no editable field is sent', async () => {
    const { service, grpc } = buildService({ project: { id: 4 } });

    await expect(
      service.adminUpdateProject(4, dto({ reason: 'x', force: true }), 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(grpc.adminUpdateProject).not.toHaveBeenCalled();
  });

  it('sends the edit to project-service and returns the project with its new values', async () => {
    const project = { id: 4, name: 'Dron', courseId: 5, eventNumber: '17' };
    const { service, grpc } = buildService({ project });

    await expect(
      service.adminUpdateProject(
        4,
        dto({
          name: ' Dron ',
          description: null,
          eventNumber: '17',
          courseId: 5,
        }),
        7,
      ),
    ).resolves.toEqual(project);
    expect(grpc.adminUpdateProject).toHaveBeenCalledWith({
      id: 4,
      actingUserId: 7,
      name: 'Dron',
      // null clears it: project-service reads the empty text as "clear"
      description: '',
      projectCode: undefined,
      eventNumber: '17',
      courseId: 5,
      reason: '',
      force: false,
    });
  });

  it('answers 409 PROJECT_NAME_TAKEN with the name in details', async () => {
    const message =
      'Ya existe otro proyecto con el nombre "Dron" en este evento. Usa un nombre distinto.';
    const { service } = buildService({
      conflict: {
        code: 'PROJECT_NAME_TAKEN',
        message,
        name: 'Dron',
        evaluationCount: 0,
      },
    });

    const error = await service
      .adminUpdateProject(4, dto({ name: 'Dron' }), 7)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    const { status, body } = httpBody(error);
    expect(status).toHaveBeenCalledWith(409);
    expect(body).toEqual({
      statusCode: 409,
      message,
      code: PROJECT_NAME_TAKEN,
      details: { name: 'Dron' },
      timestamp: expect.any(String) as unknown,
    });
  });

  it('answers 409 PROJECT_CATEGORY_CHANGE_BLOCKED with the evaluation count in details', async () => {
    const message =
      'No se cambió la categoría porque el proyecto ya tiene 2 evaluaciones de jurados, calificadas con las rúbricas de la categoría actual. Confirma el cambio para aplicarlo de todas formas.';
    const { service } = buildService({
      conflict: {
        code: 'PROJECT_CATEGORY_CHANGE_BLOCKED',
        message,
        evaluationCount: 2,
        name: '',
      },
    });

    const error = await service
      .adminUpdateProject(4, dto({ courseId: 5 }), 7)
      .catch((e: unknown) => e);

    const { status, body } = httpBody(error);
    expect(status).toHaveBeenCalledWith(409);
    expect(body).toEqual({
      statusCode: 409,
      message,
      code: PROJECT_CATEGORY_CHANGE_BLOCKED,
      details: { evaluationCount: 2 },
      timestamp: expect.any(String) as unknown,
    });
  });

  it('sends force to project-service so the category changes despite evaluations', async () => {
    const { service, grpc } = buildService({ project: { id: 4, courseId: 5 } });

    await service.adminUpdateProject(4, dto({ courseId: 5, force: true }), 7);

    expect(grpc.adminUpdateProject).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 5, force: true }),
    );
  });
});
