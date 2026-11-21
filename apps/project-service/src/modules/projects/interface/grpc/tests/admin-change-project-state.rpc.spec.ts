import { ProjectsController } from '../projects.controller';
import { ProjectStateChangeBlockedError } from '../../../domain/admin-state-change';
import { ValidationError } from '../../../domain/errors';

describe('ProjectsService.AdminChangeProjectState', () => {
  const build = (execute: jest.Mock) => {
    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, { adminChangeProjectStateUC: { execute } });
    return controller;
  };

  const request = {
    id: 4,
    actingUserId: 1,
    state: 1,
    reason: 'Aprobado por error',
    notify: false,
    force: false,
  };

  it('maps the proto state and returns the changed project with the failed effects', async () => {
    const execute = jest.fn().mockResolvedValue({
      project: { id: 4, eventId: 9, name: 'Robot', state: 'UNDER_REVIEW' },
      failedEffects: ['NOTIFICATION'],
      warning:
        'El estado se cambió, pero no se pudieron enviar todos los correos a los integrantes.',
    });

    const res = await build(execute).adminChangeProjectStateRpc(request);

    expect(execute).toHaveBeenCalledWith({
      projectId: 4,
      actingUserId: 1,
      state: 'UNDER_REVIEW',
      reason: 'Aprobado por error',
      notify: false,
      force: false,
    });
    expect(res).toMatchObject({
      project: { id: 4, state: 1 },
      failedEffects: ['NOTIFICATION'],
      warning: expect.stringContaining('correos') as unknown,
    });
  });

  it('leaves an unspecified state undefined so the use case answers 400', async () => {
    const execute = jest.fn().mockResolvedValue({
      project: { id: 4, state: 'APPROVED' },
      failedEffects: [],
      warning: null,
    });

    await build(execute).adminChangeProjectStateRpc({ ...request, state: 0 });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ state: undefined }),
    );
  });

  it('answers blocked instead of an error when the change needs force', async () => {
    const block = {
      hasEvaluations: false,
      evaluationCount: 0,
      resultsPublished: true,
      leavesApproved: false,
      message:
        'No se cambió el estado porque el evento ya publicó sus resultados.',
    };
    const execute = jest
      .fn()
      .mockRejectedValue(new ProjectStateChangeBlockedError(block));

    await expect(
      build(execute).adminChangeProjectStateRpc(request),
    ).resolves.toEqual({ blocked: block });
  });

  it('lets the other errors reach the gRPC error filter', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(
        new ValidationError('El motivo del cambio de estado es obligatorio'),
      );

    await expect(
      build(execute).adminChangeProjectStateRpc(request),
    ).rejects.toThrow(ValidationError);
  });
});
