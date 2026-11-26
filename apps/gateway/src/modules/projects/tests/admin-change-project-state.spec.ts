import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import { ProjectState } from '@app/common/generated/project';
import {
  ProjectsService,
  PROJECT_STATE_CHANGE_BLOCKED,
} from '../projects.service';
import { ProjectsController } from '../projects.controller';
import { AdminChangeProjectStateDto } from '../dto/admin-change-project-state.dto';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';
import { GrpcExceptionFilter } from '../../../common/filters/grpc-exception.filter';

describe('PATCH /projects/:id/admin/state', () => {
  const buildService = (response: unknown) => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    const grpc = { adminChangeProjectState: jest.fn(() => of(response)) };
    Object.assign(service, { projectsService: grpc });
    return { service, grpc };
  };

  const dto = (body: Record<string, unknown>) =>
    plainToInstance(AdminChangeProjectStateDto, body);

  const messages = async (body: Record<string, unknown>) =>
    (await validate(dto(body))).flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );

  it('requires manage:projects (403 without it)', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ProjectsController.prototype,
      'adminChangeProjectState',
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'manage:projects',
    ]);
  });

  it('answers 400 in Spanish without a reason or with a blank one', async () => {
    expect(await messages({ state: 'APPROVED' })).toContain(
      'El motivo del cambio de estado es obligatorio',
    );
    expect(await messages({ state: 'APPROVED', reason: '   ' })).toContain(
      'El motivo del cambio de estado es obligatorio',
    );
  });

  it('answers 400 for an unknown state', async () => {
    expect(await messages({ state: 'DELETED', reason: 'x' })).toContain(
      'El estado debe ser UNDER_REVIEW, APPROVED, REJECTED o REQUEST_CHANGES',
    );
  });

  it('accepts a state, a reason and the optional flags', async () => {
    expect(
      await messages({
        state: 'UNDER_REVIEW',
        reason: 'Aprobado por error',
        notify: true,
        force: false,
      }),
    ).toEqual([]);
  });

  it('sends the change to project-service with notify and force false by default and returns the project', async () => {
    const project = { id: 4, state: 'UNDER_REVIEW' };
    const { service, grpc } = buildService({
      project,
      blocked: null,
      failedEffects: [],
      warning: '',
    });

    await expect(
      service.adminChangeProjectState(
        4,
        dto({ state: 'UNDER_REVIEW', reason: 'Aprobado por error' }),
        7,
      ),
    ).resolves.toEqual({ project, failedEffects: [], warning: null });
    expect(grpc.adminChangeProjectState).toHaveBeenCalledWith({
      id: 4,
      actingUserId: 7,
      state: ProjectState.UNDER_REVIEW,
      reason: 'Aprobado por error',
      notify: false,
      force: false,
    });
  });

  it('answers 409 with the code and the cause when project-service blocks the change', async () => {
    const blocked = {
      hasEvaluations: true,
      evaluationCount: 2,
      resultsPublished: false,
      leavesApproved: true,
      message:
        'No se cambió el estado porque el proyecto ya tiene 2 evaluaciones de jurados.',
    };
    const { service } = buildService({ blocked });

    const error = await service
      .adminChangeProjectState(
        4,
        dto({ state: 'REJECTED', reason: 'Plagio' }),
        7,
      )
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);

    // The exception filter keeps code and details in the body
    const json = jest.fn();
    const response = { status: jest.fn(() => ({ json })) };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GrpcExceptionFilter().catch(error, host as any);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      message: blocked.message,
      code: PROJECT_STATE_CHANGE_BLOCKED,
      details: {
        hasEvaluations: true,
        evaluationCount: 2,
        resultsPublished: false,
        leavesApproved: true,
      },
      timestamp: expect.any(String) as unknown,
    });
  });

  it('answers 200 with the failed effects and the warning when work after the change failed', async () => {
    const project = { id: 4, state: 'APPROVED' };
    const warning =
      'El estado se cambió, pero no se pudo dar el rol de tutor ni enviar las invitaciones a los tutores (se reintenta aprobando de nuevo el proyecto).';
    const { service } = buildService({
      project,
      blocked: null,
      failedEffects: ['TUTOR_ACTIVATION'],
      warning,
    });

    await expect(
      service.adminChangeProjectState(
        4,
        dto({ state: 'APPROVED', reason: 'Aprobado por error' }),
        7,
      ),
    ).resolves.toEqual({
      project,
      failedEffects: ['TUTOR_ACTIVATION'],
      warning,
    });
  });
});
