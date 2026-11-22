import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { AdminRemoveParticipantUC } from '../admin-remove-participant.uc';
import { AdminParticipantsError } from '../../../domain/admin-participants';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import {
  PendingProjectParticipant,
  ProjectParticipant,
} from '../../../domain/entities/project.entity';

describe('AdminRemoveParticipantUC', () => {
  const pending = (
    pendingId: number,
    email: string,
    studentCode: string,
    status: PendingProjectParticipant['status'] = 'PENDING',
  ): PendingProjectParticipant => ({
    pendingId,
    projectId: 4,
    firstName: email.split('@')[0],
    lastName: null,
    email,
    studentCode,
    semester: '6',
    career: 'ing_sistemas',
    status,
  });

  const setup = (
    participants: ProjectParticipant[],
    pendings: PendingProjectParticipant[],
  ) => {
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
    const track = (name: string, value: unknown) =>
      jest.fn(() => {
        if (open) inTransaction.push(name);
        return Promise.resolve(value);
      });
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: 4,
        eventId: 9,
        name: 'Robot',
        state: 'APPROVED',
      }),
      lockProject: track('lock', undefined),
      listParticipants: jest.fn().mockResolvedValue(participants),
      listPendingParticipants: jest.fn().mockResolvedValue(pendings),
      removeParticipant: track('participant', true),
      removePendingParticipants: track('pending', 1),
    };
    const auth = {
      findUsersByIds: jest
        .fn()
        .mockResolvedValue([
          { id: 42, email: 'ana@uni.edu', firstName: 'Ana', lastName: 'Pérez' },
        ]),
    };
    const changeLog = {
      create: track('changeLog', { id: 1 }),
      listByProject: jest.fn(),
    };
    const uc = new AdminRemoveParticipantUC(
      repo as any,
      auth as any,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    return { uc, repo, changeLog, inTransaction };
  };

  const base = { projectId: 4, actingUserId: 1, reason: 'Se retiró' };
  const ANA = { userId: 42, projectId: 4, studentCode: '2021' };
  const LUIS = { userId: 43, projectId: 4, studentCode: '2022' };

  it('removes an enrolled participant and their pending row, and records it', async () => {
    const { uc, repo, changeLog, inTransaction } = setup(
      [ANA, LUIS],
      [
        pending(1, 'ana@uni.edu', '2021', 'JOINED'),
        pending(2, 'luis@uni.edu', '2022', 'JOINED'),
      ],
    );

    await uc.execute({ ...base, userId: 42 });

    expect(repo.removeParticipant).toHaveBeenCalledWith(4, 42);
    expect(repo.removePendingParticipants).toHaveBeenCalledWith(4, [1]);
    expect(changeLog.create).toHaveBeenCalledWith({
      projectId: 4,
      actorUserId: 1,
      action: 'PARTICIPANTS',
      before: {
        participant: {
          type: 'ENROLLED',
          userId: 42,
          studentCode: '2021',
          email: 'ana@uni.edu',
          firstName: 'Ana',
          lastName: 'Pérez',
        },
      },
      after: { participant: null },
      reason: 'Se retiró',
    });
    expect(inTransaction).toEqual([
      'lock',
      'participant',
      'pending',
      'changeLog',
    ]);
  });

  it('answers LAST_PARTICIPANT (400) when the only participant is removed, and changes nothing', async () => {
    const { uc, repo, changeLog } = setup(
      [ANA],
      // Their own pending row (joined) is the same person, not another participant
      [pending(1, 'ana@uni.edu', '2021', 'JOINED')],
    );

    const error = (await uc
      .execute({ ...base, userId: 42 })
      .catch((e: unknown) => e)) as AdminParticipantsError;

    expect(error).toBeInstanceOf(AdminParticipantsError);
    expect(error.rejection.code).toBe('LAST_PARTICIPANT');
    expect(repo.removeParticipant).not.toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('counts the pending participants: the enrolled one can go when a pending one stays', async () => {
    const { uc, repo } = setup([ANA], [pending(2, 'luis@uni.edu', '2022')]);

    await uc.execute({ ...base, userId: 42 });

    expect(repo.removeParticipant).toHaveBeenCalledWith(4, 42);
    expect(repo.removePendingParticipants).toHaveBeenCalledWith(4, []);
  });

  it('removes a pending participant by id and records it', async () => {
    const { uc, repo, changeLog } = setup(
      [ANA],
      [pending(2, 'luis@uni.edu', '2022', 'INVITED')],
    );

    await uc.execute({ ...base, pendingId: 2 });

    expect(repo.removeParticipant).not.toHaveBeenCalled();
    expect(repo.removePendingParticipants).toHaveBeenCalledWith(4, [2]);
    expect(changeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        before: {
          participant: expect.objectContaining({
            type: 'PENDING',
            pendingId: 2,
            email: 'luis@uni.edu',
          }) as unknown,
        },
        after: { participant: null },
      }),
    );
  });

  it('answers LAST_PARTICIPANT when the only pending participant is removed', async () => {
    const { uc } = setup([], [pending(2, 'luis@uni.edu', '2022')]);

    await expect(uc.execute({ ...base, pendingId: 2 })).rejects.toMatchObject({
      rejection: { code: 'LAST_PARTICIPANT' },
    });
  });

  it('does not remove a joined pending row (it is removed as enrolled)', async () => {
    const { uc } = setup(
      [ANA, LUIS],
      [pending(1, 'ana@uni.edu', '2021', 'JOINED')],
    );

    await expect(uc.execute({ ...base, pendingId: 1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('answers 404 for a participant that is not in the project', async () => {
    const { uc, changeLog } = setup([LUIS], []);

    await expect(uc.execute({ ...base, userId: 42 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(uc.execute({ ...base, pendingId: 9 })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('answers 400 without exactly one of userId or pendingId', async () => {
    const { uc } = setup([ANA], []);
    await expect(uc.execute({ ...base })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      uc.execute({ ...base, userId: 42, pendingId: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
