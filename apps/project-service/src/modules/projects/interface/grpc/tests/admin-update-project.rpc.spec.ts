import { ProjectsController } from '../projects.controller';
import {
  categoryChangeBlocked,
  ProjectNameTakenError,
} from '../../../domain/admin-project-edit';
import { ValidationError } from '../../../domain/errors';

describe('ProjectsService.AdminUpdateProject', () => {
  const build = (execute: jest.Mock) => {
    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, { adminUpdateProjectUC: { execute } });
    return controller;
  };

  const request = {
    id: 4,
    actingUserId: 1,
    name: 'Dron',
    courseId: 5,
    reason: 'Categoría equivocada',
    force: false,
  };

  it('passes the edit to the use case and returns the edited project', async () => {
    const execute = jest.fn().mockResolvedValue({
      id: 4,
      eventId: 9,
      courseId: 5,
      name: 'Dron',
      state: 'APPROVED',
    });

    const res = await build(execute).adminUpdateProjectRpc(request);

    expect(execute).toHaveBeenCalledWith({
      projectId: 4,
      actingUserId: 1,
      name: 'Dron',
      description: undefined,
      projectCode: undefined,
      eventNumber: undefined,
      courseId: 5,
      reason: 'Categoría equivocada',
      force: false,
    });
    expect(res).toMatchObject({
      project: { id: 4, name: 'Dron', courseId: 5 },
    });
  });

  it('answers the conflict instead of an error when the name is taken', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new ProjectNameTakenError('Dron'));

    const res = await build(execute).adminUpdateProjectRpc(request);

    expect(res).toEqual({
      conflict: expect.objectContaining({
        code: 'PROJECT_NAME_TAKEN',
        name: 'Dron',
      }) as unknown,
    });
  });

  it('answers the conflict when the category change needs force', async () => {
    const execute = jest.fn().mockRejectedValue(categoryChangeBlocked(1));

    const res = await build(execute).adminUpdateProjectRpc(request);

    expect(res).toEqual({
      conflict: expect.objectContaining({
        code: 'PROJECT_CATEGORY_CHANGE_BLOCKED',
        evaluationCount: 1,
        message: expect.stringContaining('1 evaluación de jurados') as unknown,
      }) as unknown,
    });
  });

  it('lets other errors reach the gRPC error filter', async () => {
    const error = new ValidationError(
      'La categoría no pertenece al evento del proyecto',
    );
    const execute = jest.fn().mockRejectedValue(error);

    await expect(build(execute).adminUpdateProjectRpc(request)).rejects.toBe(
      error,
    );
  });
});
