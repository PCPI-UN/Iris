import { AdminCreateProjectRequest } from '@app/common/generated/project';
import { ProjectsController } from '../projects.controller';
import {
  EventResultsPublishedError,
  ParticipantInOtherProjectError,
  ProjectNameTakenError,
} from '../../../domain/admin-project-creation';
import { studentCodeAlreadyInProject } from '../../../domain/admin-participants';
import { ValidationError } from '../../../domain/errors';

describe('ProjectsService.AdminCreateProject', () => {
  const build = (execute: jest.Mock) => {
    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, {
      adminCreateProjectUC: { execute },
      listProjectTutorsUC: {
        execute: jest
          .fn()
          .mockResolvedValue(
            new Map([
              [40, [{ userId: 7, email: 'tutor@uni.edu', lastName: null }]],
            ]),
          ),
      },
    });
    return controller;
  };

  const request = (
    change: Partial<AdminCreateProjectRequest> = {},
  ): AdminCreateProjectRequest => ({
    eventId: 9,
    courseId: 3,
    name: 'Robot',
    nrc: '1001',
    participants: [
      {
        firstName: 'Ana',
        email: 'ana@uni.edu',
        studentCode: '1',
        semester: '6',
        career: 'x',
      },
    ],
    tutorUserIds: [7],
    pendingTutors: [],
    actingUserId: 5,
    originKind: 'ADMIN_FORM',
    ...change,
  });

  const created = {
    project: {
      id: 40,
      eventId: 9,
      courseId: 3,
      name: 'Robot',
      state: 'APPROVED',
    },
    participants: [{ email: 'ana@uni.edu', status: 'JOINED' }],
    failedEffects: ['NOTIFICATION'],
    warning: 'El proyecto se creó, pero …',
  };

  it('leaves an unset state to the use case (APPROVED) and answers the created project', async () => {
    const execute = jest.fn().mockResolvedValue(created);

    const res = await build(execute).adminCreateProjectRpc(request());

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 9,
        name: 'Robot',
        state: undefined,
        actingUserId: 5,
        tutorUserIds: [7],
        origin: { kind: 'ADMIN_FORM' },
      }),
    );
    expect(res).toMatchObject({
      project: { id: 40, state: 2 },
      participants: [{ email: 'ana@uni.edu', status: 'JOINED' }],
      tutors: [{ userId: 7, email: 'tutor@uni.edu' }],
      failedEffects: ['NOTIFICATION'],
      warning: 'El proyecto se creó, pero …',
    });
    expect(res.rejected).toBeUndefined();
  });

  it('maps UNDER_REVIEW and a bulk origin', async () => {
    const execute = jest.fn().mockResolvedValue(created);

    await build(execute).adminCreateProjectRpc(
      request({
        state: 1,
        originKind: 'ADMIN_BULK',
        originFileName: 'feria.xlsx',
        originRowNumber: 4,
      }),
    );

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'UNDER_REVIEW',
        origin: { kind: 'ADMIN_BULK', fileName: 'feria.xlsx', rowNumber: 4 },
      }),
    );
  });

  it.each([
    ['PROJECT_NAME_TAKEN', new ProjectNameTakenError('Robot'), []],
    ['EVENT_RESULTS_PUBLISHED', new EventResultsPublishedError(), []],
    [
      'PARTICIPANT_IN_OTHER_PROJECT',
      new ParticipantInOtherProjectError(['ana@uni.edu', 'luis@uni.edu']),
      ['ana@uni.edu', 'luis@uni.edu'],
    ],
    [
      'PARTICIPANT_ALREADY_IN_PROJECT',
      studentCodeAlreadyInProject('ana@uni.edu', '1'),
      ['ana@uni.edu'],
    ],
  ])('answers %s as rejected', async (code, error, emails) => {
    const execute = jest.fn().mockRejectedValue(error);

    const res = await build(execute).adminCreateProjectRpc(request());

    expect(res).toEqual({
      participants: [],
      tutors: [],
      rejected: { code, message: (error as Error).message, emails },
      failedEffects: [],
      warning: '',
    });
  });

  it('lets any other error go out (400 for a validation)', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new ValidationError('El NRC es obligatorio'));

    await expect(
      build(execute).adminCreateProjectRpc(request()),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
