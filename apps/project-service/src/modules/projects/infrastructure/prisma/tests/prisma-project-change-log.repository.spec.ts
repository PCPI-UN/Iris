import {
  PrismaProjectChangeLogRepository,
  toProjectChangeLogData,
} from '../prisma-project-change-log.repository';

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
});

describe('toProjectChangeLogData', () => {
  it('maps a new entry to the data of a project_change_log row', () => {
    expect(
      toProjectChangeLogData({
        projectId: 4,
        actorUserId: 1,
        action: 'TUTORS',
        before: { tutorUserIds: [3] },
        after: { tutorUserIds: [3, 5] },
        reason: 'Faltaba un tutor',
      }),
    ).toEqual({
      projectId: 4,
      actorUserId: 1,
      action: 'TUTORS',
      before: { tutorUserIds: [3] },
      after: { tutorUserIds: [3, 5] },
      reason: 'Faltaba un tutor',
    });
  });
});
