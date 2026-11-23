import { ListMyEventsWithRolesUseCase } from '../list-my-events-with-roles.use-case';

const NOW = new Date('2026-06-15T12:00:00Z');

function build(opts: {
  jurorEventIds?: number[];
  projectRoles?: { eventId: number; roles: string[] }[];
  projectError?: Error;
  events?: { id: number }[];
  total?: number;
}) {
  const eventRepository = {
    findByIdsAndPeriod: jest.fn().mockResolvedValue({
      events: opts.events ?? [],
      total: opts.total ?? (opts.events ?? []).length,
    }),
  };
  const eventMemberRepository = {
    findActiveEventIdsByUserAndRole: jest
      .fn()
      .mockResolvedValue(opts.jurorEventIds ?? []),
  };
  const projectClient = {
    listMyEventRoles: opts.projectError
      ? jest.fn().mockRejectedValue(opts.projectError)
      : jest.fn().mockResolvedValue(opts.projectRoles ?? []),
  };
  const uc = new ListMyEventsWithRolesUseCase(
    eventRepository as any,
    eventMemberRepository as any,
    projectClient as any,
  );
  return { uc, eventRepository, eventMemberRepository, projectClient };
}

describe('ListMyEventsWithRolesUseCase', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('merges JURY and TUTOR in the same event and keeps a fixed role order', async () => {
    const { uc, eventRepository, eventMemberRepository } = build({
      jurorEventIds: [10, 20],
      projectRoles: [
        { eventId: 10, roles: ['TUTOR', 'PARTICIPANT'] },
        { eventId: 30, roles: ['PARTICIPANT'] },
      ],
      events: [{ id: 10 }, { id: 20 }, { id: 30 }],
    });

    const result = await uc.execute({ userId: 5, status: 'current' });

    expect(result.items.map((i) => [i.event.id, i.roles])).toEqual([
      [10, ['JURY', 'PARTICIPANT', 'TUTOR']],
      [20, ['JURY']],
      [30, ['PARTICIPANT']],
    ]);
    expect(eventMemberRepository.findActiveEventIdsByUserAndRole).toHaveBeenCalledWith(5, 4);
    expect(eventRepository.findByIdsAndPeriod).toHaveBeenCalledWith({
      ids: [10, 20, 30],
      period: 'current',
      now: NOW,
      page: 1,
      limit: 10,
    });
  });

  it('asks for the past period with the clock of the call and caps the limit at 50', async () => {
    const { uc, eventRepository } = build({
      jurorEventIds: [10],
      events: [{ id: 10 }],
      total: 80,
    });

    const result = await uc.execute({ userId: 5, status: 'past', page: 2, limit: 500 });

    expect(eventRepository.findByIdsAndPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'past', now: NOW, page: 2, limit: 50 }),
    );
    expect(result).toMatchObject({ total: 80, page: 2, limit: 50 });
  });

  it('does not query events when the user has no role anywhere', async () => {
    const { uc, eventRepository } = build({});

    const result = await uc.execute({ userId: 5, status: 'current' });

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 10 });
    expect(eventRepository.findByIdsAndPeriod).not.toHaveBeenCalled();
  });

  it('fails when project-service fails instead of answering with only JURY', async () => {
    const { uc, eventRepository } = build({
      jurorEventIds: [10],
      projectError: new Error('project-service down'),
    });

    await expect(uc.execute({ userId: 5, status: 'current' })).rejects.toThrow('project-service down');
    expect(eventRepository.findByIdsAndPeriod).not.toHaveBeenCalled();
  });
});
