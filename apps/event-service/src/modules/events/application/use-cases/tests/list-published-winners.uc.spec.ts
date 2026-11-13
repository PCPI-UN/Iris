import { ListPublishedWinnersUC } from '../list-published-winners.uc';
import { AwardWinnerRepository } from '../../../domain/repositories/award-winner.repository';
import {
  PublishedWinner,
  PublishedWinnersEvent,
} from '../../../domain/entities/published-winner.entity';

describe('ListPublishedWinnersUC', () => {
  const newest = new PublishedWinnersEvent(
    9,
    'Feria 2026',
    new Date('2026-10-01T00:00:00Z'),
    new Date('2026-10-03T00:00:00Z'),
    true,
  );
  const older = new PublishedWinnersEvent(
    4,
    'Feria 2025',
    new Date('2025-10-01T00:00:00Z'),
    new Date('2025-10-03T00:00:00Z'),
    false,
  );

  // Repository order: category, award position, winner id
  const winners = [
    new PublishedWinner(1, 100, 95, 10, 'Primer lugar', 1, 7, 'Software', 9),
    new PublishedWinner(2, 101, 90, 11, 'Segundo lugar', 2, 7, 'Software', 9),
    new PublishedWinner(3, 102, 90, 11, 'Segundo lugar', 2, 7, 'Software', 9),
    new PublishedWinner(4, 103, 88, 12, 'Primer lugar', 1, 8, 'Hardware', 9),
    new PublishedWinner(5, 200, 97, 20, 'Primer lugar', 1, 3, 'Software', 4),
  ];

  const buildRepo = (events = [newest, older], total = events.length) => ({
    findByProjectIds: jest.fn(),
    findEventsWithPublishedWinners: jest
      .fn()
      .mockResolvedValue({ events, total }),
    findWinnersByEventIds: jest.fn().mockResolvedValue(winners),
  });

  it('groups winners by event, category and award, keeping the event order', async () => {
    const repo = buildRepo();
    const uc = new ListPublishedWinnersUC(
      repo as unknown as AwardWinnerRepository,
    );

    const result = await uc.execute({});

    expect(repo.findWinnersByEventIds).toHaveBeenCalledWith([9, 4]);
    expect(result.events.map((event) => event.eventId)).toEqual([9, 4]);

    const [software, hardware] = result.events[0].categories;
    expect(software.name).toBe('Software');
    expect(software.awards.map((award) => award.title)).toEqual([
      'Primer lugar',
      'Segundo lugar',
    ]);
    expect(hardware.awards[0].winners).toEqual([
      { winnerId: 4, projectId: 103, grade: 88 },
    ]);
  });

  it('flags co-winners when an award has more than one winner', async () => {
    const uc = new ListPublishedWinnersUC(
      buildRepo() as unknown as AwardWinnerRepository,
    );

    const result = await uc.execute({});
    const [first, second] = result.events[0].categories[0].awards;

    expect(first.coWinners).toBe(false);
    expect(second.coWinners).toBe(true);
    expect(second.winners.map((winner) => winner.projectId)).toEqual([
      101, 102,
    ]);
  });

  it('hides grades unless the event ranking shows them', async () => {
    const uc = new ListPublishedWinnersUC(
      buildRepo() as unknown as AwardWinnerRepository,
    );

    const result = await uc.execute({});

    expect(result.events[0].categories[0].awards[0].winners[0].grade).toBe(95);
    expect(result.events[1].categories[0].awards[0].winners[0].grade).toBeNull();
  });

  it('defaults to page 1 with 10 events and passes the requested page', async () => {
    const repo = buildRepo();
    const uc = new ListPublishedWinnersUC(
      repo as unknown as AwardWinnerRepository,
    );

    await uc.execute({});
    expect(repo.findEventsWithPublishedWinners).toHaveBeenLastCalledWith(1, 10);

    const result = await uc.execute({ page: 3, limit: 5 });
    expect(repo.findEventsWithPublishedWinners).toHaveBeenLastCalledWith(3, 5);
    expect(result).toMatchObject({ page: 3, limit: 5, total: 2 });
  });

  it('does not look winners up when the page has no events', async () => {
    const repo = buildRepo([], 4);
    const uc = new ListPublishedWinnersUC(
      repo as unknown as AwardWinnerRepository,
    );

    const result = await uc.execute({ page: 9 });

    expect(result).toEqual({ events: [], total: 4, page: 9, limit: 10 });
    expect(repo.findWinnersByEventIds).not.toHaveBeenCalled();
  });
});
