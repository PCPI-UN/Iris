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
      projectChangeLog: { findMany: jest.fn().mockResolvedValue([row]) },
    };

    const result = await new PrismaProjectChangeLogRepository(
      prisma as any,
    ).listByProject(4);

    expect(prisma.projectChangeLog.findMany).toHaveBeenCalledWith({
      where: { projectId: 4 },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(result).toEqual([row]);
  });

  it('creates an entry and maps it back', async () => {
    const prisma = {
      projectChangeLog: { create: jest.fn().mockResolvedValue(row) },
    };
    const entry = {
      projectId: row.projectId,
      actorUserId: row.actorUserId,
      action: row.action,
      before: row.before,
      after: row.after,
      reason: row.reason,
    };

    const result = await new PrismaProjectChangeLogRepository(
      prisma as any,
    ).create(entry as any);

    expect(prisma.projectChangeLog.create).toHaveBeenCalledWith({
      data: entry,
    });
    expect(result).toEqual(row);
  });
});
