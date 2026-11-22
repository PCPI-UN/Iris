import { ProjectsController } from '../projects.controller';
import {
  lastParticipant,
  participantHasActiveProject,
} from '../../../domain/admin-participants';
import { ValidationError } from '../../../domain/errors';

describe('ProjectsService administrative participants and tutors RPCs', () => {
  const build = (deps: Record<string, unknown>) => {
    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, deps);
    return controller;
  };

  it('AdminAddParticipant returns the pending participant with its status as proto', async () => {
    const execute = jest.fn().mockResolvedValue({
      pendingParticipant: {
        pendingId: 11,
        projectId: 4,
        firstName: 'Ana',
        email: 'ana@uni.edu',
        studentCode: '1',
        semester: '6',
        career: 'x',
        status: 'INVITED',
      },
      failedEffects: [],
      warning: null,
    });
    const pending = {
      firstName: 'Ana',
      email: 'ana@uni.edu',
      studentCode: '1',
      semester: '6',
      career: 'x',
    };

    const res = await build({
      adminAddParticipantUC: { execute },
    }).adminAddParticipantRpc({
      projectId: 4,
      actingUserId: 1,
      pending,
      reason: 'Faltaba',
    });

    expect(execute).toHaveBeenCalledWith({
      projectId: 4,
      actingUserId: 1,
      userId: undefined,
      studentCode: undefined,
      pending,
      reason: 'Faltaba',
    });
    expect(res).toMatchObject({
      participant: undefined,
      pendingParticipant: { pendingId: 11, status: 2 },
      failedEffects: [],
      warning: '',
    });
  });

  it('AdminAddParticipant answers `rejected` instead of an error when the student has an active project', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(participantHasActiveProject('ana@uni.edu', 12));

    const res = await build({
      adminAddParticipantUC: { execute },
    }).adminAddParticipantRpc({ projectId: 4, actingUserId: 1, userId: 42 });

    expect(res).toEqual({
      rejected: expect.objectContaining({
        code: 'PARTICIPANT_HAS_ACTIVE_PROJECT',
        email: 'ana@uni.edu',
        projectId: 12,
      }) as unknown,
      failedEffects: [],
      warning: '',
    });
  });

  it('AdminRemoveParticipant answers `rejected` for the last participant and rethrows other errors', async () => {
    const execute = jest.fn().mockRejectedValueOnce(lastParticipant());
    const controller = build({ adminRemoveParticipantUC: { execute } });

    await expect(
      controller.adminRemoveParticipantRpc({
        projectId: 4,
        actingUserId: 1,
        userId: 42,
      }),
    ).resolves.toEqual({
      rejected: expect.objectContaining({
        code: 'LAST_PARTICIPANT',
      }) as unknown,
    });

    execute.mockRejectedValueOnce(new ValidationError('x'));
    await expect(
      controller.adminRemoveParticipantRpc({
        projectId: 4,
        actingUserId: 1,
        pendingId: 2,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('SetProjectTutors records the change with the acting user', async () => {
    const execute = jest.fn().mockResolvedValue([]);

    await build({
      replaceProjectTutorsUC: { execute },
    }).setProjectTutorsRpc({
      projectId: 3,
      tutorUserIds: [5],
      actingUserId: 1,
      reason: 'Cambio',
    });

    expect(execute).toHaveBeenCalledWith({
      projectId: 3,
      actingUserId: 1,
      tutorUserIds: [5],
      pendingTutors: [],
      reason: 'Cambio',
    });
  });
});
