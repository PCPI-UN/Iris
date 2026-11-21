import { PrismaProjectRepository } from '../prisma-project.repository';

describe('PrismaProjectRepository (tutors)', () => {
  let db: any;
  let prisma: any;
  let repo: PrismaProjectRepository;

  beforeEach(() => {
    db = {
      projectTutor: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn((a) => ({ op: 'deleteTutors', a })),
        createMany: jest.fn((a) => ({ op: 'createTutors', a })),
      },
      pendingProjectTutor: {
        upsert: jest.fn((a) => ({ op: 'upsertPending', a })),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn((a) => ({ op: 'deletePendings', a })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma = { db, transaction: jest.fn((work) => work(db)) };
    repo = new PrismaProjectRepository(prisma);
  });

  it('addTutor is an upsert on (project, user), so repeating it keeps one row', async () => {
    await repo.addTutor(3, 7);

    expect(db.projectTutor.upsert).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 3, userId: 7 } },
      update: {},
      create: { projectId: 3, userId: 7 },
    });
  });

  it('listTutorUserIds returns only the user ids', async () => {
    db.projectTutor.findMany.mockResolvedValue([{ userId: 7 }, { userId: 9 }]);

    await expect(repo.listTutorUserIds(3)).resolves.toEqual([7, 9]);
  });

  it('replaceTutors runs in one transaction: removes the missing, adds the new, normalizes emails', async () => {
    await repo.replaceTutors(3, [7, 9], [
      { firstName: 'Ana', lastName: null, email: '  Ana@Example.COM ' },
    ]);

    expect(db.projectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, userId: { notIn: [7, 9] } },
    });
    expect(db.projectTutor.createMany).toHaveBeenCalledWith({
      data: [
        { projectId: 3, userId: 7 },
        { projectId: 3, userId: 9 },
      ],
      skipDuplicates: true,
    });
    expect(db.pendingProjectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: { notIn: ['ana@example.com'] } },
    });
    expect(db.pendingProjectTutor.upsert).toHaveBeenCalledWith({
      where: { projectId_email: { projectId: 3, email: 'ana@example.com' } },
      update: { firstName: 'Ana', lastName: null },
      create: { projectId: 3, email: 'ana@example.com', firstName: 'Ana', lastName: null },
    });
    expect(prisma.transaction).toHaveBeenCalledTimes(1);
    const order = [
      db.projectTutor.deleteMany,
      db.projectTutor.createMany,
      db.pendingProjectTutor.deleteMany,
      db.pendingProjectTutor.upsert,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('replaceTutors with empty lists removes every tutor and pending tutor', async () => {
    await repo.replaceTutors(3, [], []);

    expect(db.projectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, userId: { notIn: [] } },
    });
    expect(db.pendingProjectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: { notIn: [] } },
    });
    expect(db.pendingProjectTutor.upsert).not.toHaveBeenCalled();
  });

  it('addPendingTutor upserts by (project, normalized email)', async () => {
    await repo.addPendingTutor(3, { firstName: 'Ana', email: 'ANA@example.com' });

    expect(db.pendingProjectTutor.upsert).toHaveBeenCalledWith({
      where: { projectId_email: { projectId: 3, email: 'ana@example.com' } },
      update: { firstName: 'Ana', lastName: null },
      create: { projectId: 3, email: 'ana@example.com', firstName: 'Ana', lastName: null },
    });
  });

  it('markPendingTutorsInvited updates by normalized emails and skips an empty list', async () => {
    const at = new Date('2026-11-12T10:00:00Z');

    await expect(repo.markPendingTutorsInvited(3, [], at)).resolves.toBe(0);
    expect(db.pendingProjectTutor.updateMany).not.toHaveBeenCalled();

    await expect(repo.markPendingTutorsInvited(3, ['A@x.com'], at)).resolves.toBe(1);
    expect(db.pendingProjectTutor.updateMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: { in: ['a@x.com'] } },
      data: { status: 'INVITED', invitedAt: at },
    });
  });

  it('markPendingTutorJoined reports whether a pending tutor matched', async () => {
    const at = new Date('2026-11-12T10:00:00Z');

    await expect(repo.markPendingTutorJoined(3, 'A@x.com', at)).resolves.toBe(true);
    expect(db.pendingProjectTutor.updateMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: 'a@x.com' },
      data: { status: 'JOINED', joinedAt: at },
    });

    db.pendingProjectTutor.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.markPendingTutorJoined(3, 'b@x.com', at)).resolves.toBe(false);
  });

  it('batch reads filter by the project ids and skip the query for an empty list', async () => {
    db.projectTutor.findMany.mockResolvedValue([{ projectId: 1, userId: 7 }]);

    await expect(repo.listTutorLinksByProjects([1, 2])).resolves.toEqual([{ projectId: 1, userId: 7 }]);
    expect(db.projectTutor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: [1, 2] } } }),
    );

    await repo.listPendingTutorsByProjects([1, 2]);
    expect(db.pendingProjectTutor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: [1, 2] } } }),
    );

    db.projectTutor.findMany.mockClear();
    db.pendingProjectTutor.findMany.mockClear();
    await expect(repo.listTutorLinksByProjects([])).resolves.toEqual([]);
    await expect(repo.listPendingTutorsByProjects([])).resolves.toEqual([]);
    expect(db.projectTutor.findMany).not.toHaveBeenCalled();
    expect(db.pendingProjectTutor.findMany).not.toHaveBeenCalled();
  });
});
