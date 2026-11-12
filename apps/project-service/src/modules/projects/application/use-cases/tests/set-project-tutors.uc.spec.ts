import { SetProjectTutorsUC } from '../set-project-tutors.uc';
import { NotFoundError, ValidationError } from '../../../domain/errors';

describe('SetProjectTutorsUC', () => {
  // In-memory tutors of project 3, so activate() reads what store() left
  let linked: number[];
  let pendings: {
    email: string;
    firstName: string;
    lastName?: string | null;
    status: string;
  }[];
  let repo: {
    findById: jest.Mock;
    listTutorUserIds: jest.Mock;
    listPendingTutors: jest.Mock;
    replaceTutors: jest.Mock;
    markPendingTutorsInvited: jest.Mock;
  };
  let auth: {
    findUsersByRoles: jest.Mock;
    findUserByEmail: jest.Mock;
    assignPlatformRoles: jest.Mock;
  };
  let invitations: { createInvitation: jest.Mock };
  let listTutors: { execute: jest.Mock };
  let uc: SetProjectTutorsUC;

  beforeEach(() => {
    linked = [];
    pendings = [];
    repo = {
      findById: jest.fn().mockResolvedValue({ id: 3, state: 'APPROVED' }),
      listTutorUserIds: jest.fn(async () => linked),
      listPendingTutors: jest.fn(async () => pendings),
      replaceTutors: jest.fn(
        async (_projectId: number, userIds: number[], next: any[]) => {
          linked = userIds;
          pendings = next.map((p) => ({
            ...p,
            status:
              pendings.find((old) => old.email === p.email)?.status ??
              'PENDING',
          }));
        },
      ),
      markPendingTutorsInvited: jest.fn().mockResolvedValue(1),
    };
    auth = {
      findUsersByRoles: jest
        .fn()
        .mockImplementation(async ({ userIds }) =>
          userIds.map((id: number) => ({ id, firstName: 'T', roleIds: [10] })),
        ),
      findUserByEmail: jest.fn().mockResolvedValue(null),
      assignPlatformRoles: jest.fn().mockResolvedValue(undefined),
    };
    invitations = {
      createInvitation: jest.fn().mockResolvedValue({ created: true }),
    };
    listTutors = {
      execute: jest
        .fn()
        .mockResolvedValue(
          new Map([[3, [{ userId: 7, firstName: 'Ana', pending: false }]]]),
        ),
    };
    uc = new SetProjectTutorsUC(
      repo as any,
      auth as any,
      invitations as any,
      listTutors as any,
    );
  });

  it('links a chosen tutor, gives the Tutor role and returns the tutors of the project', async () => {
    const tutors = await uc.execute({ projectId: 3, tutorUserIds: [7] });

    expect(auth.findUsersByRoles).toHaveBeenCalledWith({
      roleIds: [9, 10],
      userIds: [7],
    });
    expect(repo.replaceTutors).toHaveBeenCalledWith(3, [7], []);
    expect(auth.assignPlatformRoles).toHaveBeenCalledWith(7, [10]);
    expect(invitations.createInvitation).not.toHaveBeenCalled();
    expect(tutors).toEqual([{ userId: 7, firstName: 'Ana', pending: false }]);
  });

  it('accepts any number of tutors', async () => {
    await uc.execute({
      projectId: 3,
      tutorUserIds: [1, 2, 3],
      pendingTutors: [
        { firstName: 'A', email: 'a@x.com' },
        { firstName: 'B', email: 'b@x.com' },
      ],
    });

    expect(repo.replaceTutors).toHaveBeenCalledWith(
      3,
      [1, 2, 3],
      expect.arrayContaining([expect.objectContaining({ email: 'a@x.com' })]),
    );
  });

  it('rejects a user id that is not an active Tutor or Professor', async () => {
    auth.findUsersByRoles.mockResolvedValue([
      { id: 1, firstName: 'T', roleIds: [10] },
    ]);

    await expect(
      uc.execute({ projectId: 3, tutorUserIds: [1, 2] }),
    ).rejects.toThrow('Users 2 are not');
    expect(repo.replaceTutors).not.toHaveBeenCalled();
  });

  it('stores a typed-in tutor as pending, invites it as PROJECT_TUTOR and marks it invited', async () => {
    await uc.execute({
      projectId: 3,
      pendingTutors: [{ firstName: ' Luis ', email: 'Luis@X.com' }],
      eventType: 'Exposition',
    });

    expect(repo.replaceTutors).toHaveBeenCalledWith(
      3,
      [],
      [{ firstName: 'Luis', lastName: null, email: 'luis@x.com' }],
    );
    expect(invitations.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'luis@x.com',
        targetType: 'PROJECT_TUTOR',
        targetId: 3,
        roleIds: [10],
        eventType: 'Exposition',
      }),
    );
    expect(repo.markPendingTutorsInvited).toHaveBeenCalledWith(
      3,
      ['luis@x.com'],
      expect.any(Date),
    );
  });

  it('links directly a typed-in email that already belongs to a Tutor or Professor', async () => {
    auth.findUserByEmail.mockResolvedValue({
      id: 9,
      firstName: 'Eva',
      email: 'eva@x.com',
      status: 'ACTIVE',
    });

    await uc.execute({
      projectId: 3,
      tutorUserIds: [9],
      pendingTutors: [{ firstName: 'Eva', email: 'eva@x.com' }],
    });

    expect(repo.replaceTutors).toHaveBeenCalledWith(3, [9], []);
    expect(invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('keeps pending a typed-in email whose account has no Tutor or Professor role', async () => {
    auth.findUserByEmail.mockResolvedValue({
      id: 9,
      firstName: 'Eva',
      email: 'eva@x.com',
      status: 'ACTIVE',
    });
    auth.findUsersByRoles.mockResolvedValue([]);

    await uc.execute({
      projectId: 3,
      pendingTutors: [{ firstName: 'Eva', email: 'eva@x.com' }],
    });

    expect(repo.replaceTutors).toHaveBeenCalledWith(
      3,
      [],
      [expect.objectContaining({ email: 'eva@x.com' })],
    );
    expect(invitations.createInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not invite again a pending tutor that was already invited', async () => {
    pendings = [{ email: 'luis@x.com', firstName: 'Luis', status: 'INVITED' }];

    await uc.execute({
      projectId: 3,
      pendingTutors: [{ firstName: 'Luis', email: 'luis@x.com' }],
    });

    expect(invitations.createInvitation).not.toHaveBeenCalled();
    expect(repo.markPendingTutorsInvited).toHaveBeenCalledWith(
      3,
      [],
      expect.any(Date),
    );
  });

  it('clears the tutors with empty lists', async () => {
    await uc.execute({ projectId: 3, tutorUserIds: [], pendingTutors: [] });

    expect(repo.replaceTutors).toHaveBeenCalledWith(3, [], []);
    expect(auth.assignPlatformRoles).not.toHaveBeenCalled();
  });

  it('stores the tutors of a project not yet approved without giving roles or sending invitations', async () => {
    repo.findById.mockResolvedValue({ id: 3, state: 'UNDER_REVIEW' });

    await uc.execute({
      projectId: 3,
      tutorUserIds: [7],
      pendingTutors: [{ firstName: 'Luis', email: 'luis@x.com' }],
    });

    expect(repo.replaceTutors).toHaveBeenCalledWith(
      3,
      [7],
      [expect.objectContaining({ email: 'luis@x.com' })],
    );
    expect(auth.assignPlatformRoles).not.toHaveBeenCalled();
    expect(invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('store alone (public submission) gives no role and sends no invitation', async () => {
    await uc.store(3, {
      userIds: [7],
      pendings: [{ firstName: 'Luis', email: 'luis@x.com' }],
    });

    expect(repo.replaceTutors).toHaveBeenCalledWith(
      3,
      [7],
      [{ firstName: 'Luis', email: 'luis@x.com' }],
    );
    expect(auth.assignPlatformRoles).not.toHaveBeenCalled();
    expect(invitations.createInvitation).not.toHaveBeenCalled();
  });

  it('activate on approval gives the role to the stored tutors and invites only the pending ones not invited', async () => {
    linked = [7];
    pendings = [
      { email: 'luis@x.com', firstName: 'Luis', status: 'PENDING' },
      { email: 'eva@x.com', firstName: 'Eva', status: 'INVITED' },
    ];

    await uc.activate(3, 'Competition');

    expect(auth.assignPlatformRoles).toHaveBeenCalledWith(7, [10]);
    expect(invitations.createInvitation).toHaveBeenCalledTimes(1);
    expect(invitations.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'luis@x.com',
        eventType: 'Competition',
      }),
    );
    expect(repo.markPendingTutorsInvited).toHaveBeenCalledWith(
      3,
      ['luis@x.com'],
      expect.any(Date),
    );
  });

  it('rejects an invalid email and an unknown project', async () => {
    await expect(
      uc.execute({
        projectId: 3,
        pendingTutors: [{ firstName: 'A', email: 'nope' }],
      }),
    ).rejects.toThrow(ValidationError);
    repo.findById.mockResolvedValue(null);
    await expect(uc.execute({ projectId: 3 })).rejects.toThrow(NotFoundError);
  });
});
