import { PrismaProjectRepository } from '../prisma-project.repository';

describe('PrismaProjectRepository (tutors)', () => {
  let prisma: any;
  let repo: PrismaProjectRepository;

  beforeEach(() => {
    prisma = {
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
      $transaction: jest.fn().mockResolvedValue([]),
    };
    repo = new PrismaProjectRepository(prisma);
  });

  it('addTutor is an upsert on (project, user), so repeating it keeps one row', async () => {
    await repo.addTutor(3, 7);

    expect(prisma.projectTutor.upsert).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 3, userId: 7 } },
      update: {},
      create: { projectId: 3, userId: 7 },
    });
  });

  it('listTutorUserIds returns only the user ids', async () => {
    prisma.projectTutor.findMany.mockResolvedValue([{ userId: 7 }, { userId: 9 }]);

    await expect(repo.listTutorUserIds(3)).resolves.toEqual([7, 9]);
  });

  it('replaceTutors runs in one transaction: removes the missing, adds the new, normalizes emails', async () => {
    await repo.replaceTutors(3, [7, 9], [
      { firstName: 'Ana', lastName: null, email: '  Ana@Example.COM ' },
    ]);

    expect(prisma.projectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, userId: { notIn: [7, 9] } },
    });
    expect(prisma.projectTutor.createMany).toHaveBeenCalledWith({
      data: [
        { projectId: 3, userId: 7 },
        { projectId: 3, userId: 9 },
      ],
      skipDuplicates: true,
    });
    expect(prisma.pendingProjectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: { notIn: ['ana@example.com'] } },
    });
    expect(prisma.pendingProjectTutor.upsert).toHaveBeenCalledWith({
      where: { projectId_email: { projectId: 3, email: 'ana@example.com' } },
      update: { firstName: 'Ana', lastName: null },
      create: { projectId: 3, email: 'ana@example.com', firstName: 'Ana', lastName: null },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(4);
  });

  it('replaceTutors with empty lists removes every tutor and pending tutor', async () => {
    await repo.replaceTutors(3, [], []);

    expect(prisma.projectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, userId: { notIn: [] } },
    });
    expect(prisma.pendingProjectTutor.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: { notIn: [] } },
    });
    expect(prisma.pendingProjectTutor.upsert).not.toHaveBeenCalled();
  });

  it('addPendingTutor upserts by (project, normalized email)', async () => {
    await repo.addPendingTutor(3, { firstName: 'Ana', email: 'ANA@example.com' });

    expect(prisma.pendingProjectTutor.upsert).toHaveBeenCalledWith({
      where: { projectId_email: { projectId: 3, email: 'ana@example.com' } },
      update: { firstName: 'Ana', lastName: null },
      create: { projectId: 3, email: 'ana@example.com', firstName: 'Ana', lastName: null },
    });
  });

  it('markPendingTutorsInvited updates by normalized emails and skips an empty list', async () => {
    const at = new Date('2026-11-12T10:00:00Z');

    await expect(repo.markPendingTutorsInvited(3, [], at)).resolves.toBe(0);
    expect(prisma.pendingProjectTutor.updateMany).not.toHaveBeenCalled();

    await expect(repo.markPendingTutorsInvited(3, ['A@x.com'], at)).resolves.toBe(1);
    expect(prisma.pendingProjectTutor.updateMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: { in: ['a@x.com'] } },
      data: { status: 'INVITED', invitedAt: at },
    });
  });

  it('markPendingTutorJoined reports whether a pending tutor matched', async () => {
    const at = new Date('2026-11-12T10:00:00Z');

    await expect(repo.markPendingTutorJoined(3, 'A@x.com', at)).resolves.toBe(true);
    expect(prisma.pendingProjectTutor.updateMany).toHaveBeenCalledWith({
      where: { projectId: 3, email: 'a@x.com' },
      data: { status: 'JOINED', joinedAt: at },
    });

    prisma.pendingProjectTutor.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.markPendingTutorJoined(3, 'b@x.com', at)).resolves.toBe(false);
  });

  it('batch reads filter by the project ids and skip the query for an empty list', async () => {
    prisma.projectTutor.findMany.mockResolvedValue([{ projectId: 1, userId: 7 }]);

    await expect(repo.listTutorLinksByProjects([1, 2])).resolves.toEqual([{ projectId: 1, userId: 7 }]);
    expect(prisma.projectTutor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: [1, 2] } } }),
    );

    await repo.listPendingTutorsByProjects([1, 2]);
    expect(prisma.pendingProjectTutor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: { in: [1, 2] } } }),
    );

    prisma.projectTutor.findMany.mockClear();
    prisma.pendingProjectTutor.findMany.mockClear();
    await expect(repo.listTutorLinksByProjects([])).resolves.toEqual([]);
    await expect(repo.listPendingTutorsByProjects([])).resolves.toEqual([]);
    expect(prisma.projectTutor.findMany).not.toHaveBeenCalled();
    expect(prisma.pendingProjectTutor.findMany).not.toHaveBeenCalled();
  });
});
