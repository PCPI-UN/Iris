import { PrismaProjectChangeLogRepository } from '../prisma-project-change-log.repository';

describe('PrismaProjectChangeLogRepository', () => {
  const row = {
    id: 3,
    projectId: 4,
    actorUserId: 1,
    action: 'STATE',
    before: { state: 'APPROVED' },
    after: { state: 'REJECTED' },
    reason: null,
    createdAt: new Date('2026-11-20T10:00:00Z'),
  };

  it('lists the entries of the project, most recent first', async () => {
    const prisma = {
      db: {
        projectChangeLog: { findMany: jest.fn().mockResolvedValue([row]) },
      },
    };

    const result = await new PrismaProjectChangeLogRepository(
      prisma as any,
    ).listByProject(4);

    expect(prisma.db.projectChangeLog.findMany).toHaveBeenCalledWith({
      where: { projectId: 4 },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result).toEqual([row]);
  });
  it('create inserts the entry through the current client and returns it', async () => {
    const created = {
      ...row,
      action: 'TUTORS',
      before: { tutorUserIds: [3] },
      after: { tutorUserIds: [3, 5] },
      reason: 'Faltaba un tutor',
    };
    const prisma = {
      db: {
        projectChangeLog: { create: jest.fn().mockResolvedValue(created) },
      },
    };

    const result = await new PrismaProjectChangeLogRepository(
      prisma as any,
    ).create({
      projectId: 4,
      actorUserId: 1,
      action: 'TUTORS',
      before: { tutorUserIds: [3] },
      after: { tutorUserIds: [3, 5] },
      reason: 'Faltaba un tutor',
    });

    expect(prisma.db.projectChangeLog.create).toHaveBeenCalledWith({
      data: {
        projectId: 4,
        actorUserId: 1,
        action: 'TUTORS',
        before: { tutorUserIds: [3] },
        after: { tutorUserIds: [3, 5] },
        reason: 'Faltaba un tutor',
      },
    });
    expect(result).toEqual(created);
  });
});
