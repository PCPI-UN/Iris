import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ReplaceProjectTutorsUC } from '../replace-project-tutors.uc';
import { SetProjectTutorsUC } from '../set-project-tutors.uc';
import { ListProjectTutorsUC } from '../list-project-tutors.uc';
import { NotFoundError, ValidationError } from '../../../domain/errors';

describe('ReplaceProjectTutorsUC', () => {
  const setup = (state = 'UNDER_REVIEW') => {
    const inTransaction: string[] = [];
    let open = false;
    const uow = {
      run: jest.fn(async (work: () => Promise<unknown>) => {
        open = true;
        try {
          return await work();
        } finally {
          open = false;
        }
      }),
    };
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 3, state }),
      listTutorUserIds: jest.fn().mockResolvedValue([7, 5]),
      listPendingTutors: jest.fn().mockResolvedValue([
        {
          email: 'Old@Uni.edu',
          firstName: 'Old',
          lastName: null,
          status: 'PENDING',
        },
      ]),
    };
    const tutors = {
      resolve: jest.fn(
        (input: { tutorUserIds: number[]; pendingTutors: object[] }) =>
          Promise.resolve({
            userIds: input.tutorUserIds,
            pendings: input.pendingTutors,
          }),
      ),
      store: jest.fn(() => {
        if (open) inTransaction.push('tutors');
        return Promise.resolve();
      }),
      activate: jest.fn().mockResolvedValue(undefined),
    };
    const listTutors = {
      execute: jest
        .fn()
        .mockResolvedValue(
          new Map([[3, [{ userId: 5, firstName: 'L', pending: false }]]]),
        ),
    };
    const changeLog = {
      create: jest.fn(() => {
        if (open) inTransaction.push('changeLog');
        return Promise.resolve({ id: 1 });
      }),
      listByProject: jest.fn(),
    };
    const uc = new ReplaceProjectTutorsUC(
      repo as any,
      tutors as unknown as SetProjectTutorsUC,
      listTutors as unknown as ListProjectTutorsUC,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    return { uc, repo, tutors, changeLog, inTransaction };
  };

  it('replaces the tutors and records TUTORS with the tutors before and after', async () => {
    const { uc, tutors, changeLog, inTransaction } = setup();

    const result = await uc.execute({
      projectId: 3,
      actingUserId: 1,
      tutorUserIds: [5],
      pendingTutors: [{ firstName: 'Ana', email: 'ana@uni.edu' }],
      reason: 'Cambio de tutor',
    });

    expect(tutors.store).toHaveBeenCalledWith(3, {
      userIds: [5],
      pendings: [{ firstName: 'Ana', email: 'ana@uni.edu' }],
    });
    expect(changeLog.create).toHaveBeenCalledWith({
      projectId: 3,
      actorUserId: 1,
      action: 'TUTORS',
      before: {
        tutorUserIds: [5, 7],
        pendingTutors: [
          { email: 'old@uni.edu', firstName: 'Old', lastName: null },
        ],
      },
      after: {
        tutorUserIds: [5],
        pendingTutors: [
          { email: 'ana@uni.edu', firstName: 'Ana', lastName: null },
        ],
      },
      reason: 'Cambio de tutor',
    });
    expect(inTransaction).toEqual(['tutors', 'changeLog']);
    // Not approved: no roles or invitations yet
    expect(tutors.activate).not.toHaveBeenCalled();
    expect(result).toEqual([{ userId: 5, firstName: 'L', pending: false }]);
  });

  it('records nothing when the tutors do not change', async () => {
    const { uc, tutors, changeLog } = setup();

    await uc.execute({
      projectId: 3,
      actingUserId: 1,
      tutorUserIds: [7, 5],
      pendingTutors: [{ firstName: 'Old', email: 'old@uni.edu' }],
    });

    expect(tutors.store).toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('activates the tutors after saving when the project is APPROVED', async () => {
    const { uc, tutors } = setup('APPROVED');

    await uc.execute({
      projectId: 3,
      actingUserId: 1,
      tutorUserIds: [5],
      pendingTutors: [],
    });

    expect(tutors.activate).toHaveBeenCalledWith(3, undefined);
  });

  it('records nothing when the selection is rejected', async () => {
    const { uc, tutors, changeLog } = setup();
    tutors.resolve.mockRejectedValue(
      new ValidationError(
        'Los usuarios 9 no son tutores ni profesores activos',
      ),
    );

    await expect(
      uc.execute({
        projectId: 3,
        actingUserId: 1,
        tutorUserIds: [9],
        pendingTutors: [],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(tutors.store).not.toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('answers 404 when the project does not exist', async () => {
    const { uc, repo } = setup();
    repo.findById.mockResolvedValue(null);

    await expect(
      uc.execute({
        projectId: 3,
        actingUserId: 1,
        tutorUserIds: [],
        pendingTutors: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
