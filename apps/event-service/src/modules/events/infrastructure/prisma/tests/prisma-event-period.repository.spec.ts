import { PrismaEventRepository } from '../prisma-event.repository';

const NOW = new Date('2026-06-15T12:00:00Z');

function build() {
  const prisma = {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  return { prisma, repo: new PrismaEventRepository(prisma as any) };
}

describe('PrismaEventRepository.findByIdsAndPeriod', () => {
  it('current: endDate equal to now still counts, ordered by startDate asc', async () => {
    const { prisma, repo } = build();

    await repo.findByIdsAndPeriod({ ids: [1, 2], period: 'current', now: NOW, page: 2, limit: 5 });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, active: true, endDate: { gte: NOW } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, active: true, endDate: { gte: NOW } },
    });
  });

  it('past: endDate equal to now is not past yet, ordered by endDate desc', async () => {
    const { prisma, repo } = build();

    await repo.findByIdsAndPeriod({ ids: [1], period: 'past', now: NOW, page: 1, limit: 10 });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: [1] }, active: true, endDate: { lt: NOW } },
      orderBy: [{ endDate: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });
  });

  it('returns empty without querying when there are no ids', async () => {
    const { prisma, repo } = build();

    expect(await repo.findByIdsAndPeriod({ ids: [], period: 'current', now: NOW, page: 1, limit: 10 })).toEqual({
      events: [],
      total: 0,
    });
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });
});
