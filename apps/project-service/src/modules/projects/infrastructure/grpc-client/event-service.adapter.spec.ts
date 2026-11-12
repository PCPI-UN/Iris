import { EventServiceAdapter } from './event-service.adapter';
import { EventGrpcClient } from './event.grpc-client';
import { EventStatus } from '@app/common/generated/event';

describe('EventServiceAdapter (student dashboard)', () => {
  const build = (grpc: Partial<Record<keyof EventGrpcClient, jest.Mock>>) =>
    new EventServiceAdapter(grpc as unknown as EventGrpcClient);

  it('maps the numeric status and treats a missing active flag as a deleted event', async () => {
    const adapter = build({
      listEventsByIds: jest.fn().mockResolvedValue({
        events: [
          {
            id: 1,
            name: 'A',
            startDate: 's',
            endDate: 'e',
            active: true,
            status: EventStatus.CLOSED,
          },
          {
            id: 2,
            name: 'B',
            startDate: 's',
            endDate: 'e',
            status: EventStatus.AVAILABLE,
          },
          { id: 3, active: true, status: EventStatus.UPCOMING },
        ],
      }),
    });

    const events = await adapter.listEventsByIds([1, 2, 3]);

    expect(events).toEqual([
      {
        id: 1,
        name: 'A',
        startDate: 's',
        endDate: 'e',
        active: true,
        finished: true,
        inProgress: false,
      },
      {
        id: 2,
        name: 'B',
        startDate: 's',
        endDate: 'e',
        active: false,
        finished: false,
        inProgress: true,
      },
      {
        id: 3,
        name: '',
        startDate: '',
        endDate: '',
        active: true,
        finished: false,
        inProgress: false,
      },
    ]);
  });

  it('treats a missing resultsPublished flag as unpublished', async () => {
    const adapter = build({
      listAwardsByProjects: jest.fn().mockResolvedValue({
        awards: [
          { projectId: 1, awardId: 5, eventId: 10, resultsPublished: true },
          { projectId: 2, awardId: 6, eventId: 10 },
        ],
      }),
    });

    const awards = await adapter.listAwardsByProjects([1, 2]);

    expect(awards.map((a) => a.resultsPublished)).toEqual([true, false]);
  });

  it('reads the category names in one call', async () => {
    const listCategoriesByIds = jest.fn().mockResolvedValue({
      categories: [{ id: 1, name: 'Sistemas', active: true }, { id: 2 }],
    });
    const adapter = build({ listCategoriesByIds });

    expect(await adapter.listCategoriesByIds([1, 2])).toEqual([
      { id: 1, name: 'Sistemas' },
      { id: 2, name: '' },
    ]);
    expect(listCategoriesByIds).toHaveBeenCalledTimes(1);
  });

  it('returns empty lists without calling event-service when there are no ids', async () => {
    const listEventsByIds = jest.fn();
    const listAwardsByProjects = jest.fn();
    const listCategoriesByIds = jest.fn();
    const adapter = build({
      listEventsByIds,
      listAwardsByProjects,
      listCategoriesByIds,
    });

    expect(await adapter.listEventsByIds([])).toEqual([]);
    expect(await adapter.listAwardsByProjects([])).toEqual([]);
    expect(await adapter.listCategoriesByIds([])).toEqual([]);
    expect(listEventsByIds).not.toHaveBeenCalled();
    expect(listAwardsByProjects).not.toHaveBeenCalled();
    expect(listCategoriesByIds).not.toHaveBeenCalled();
  });

  it('handles empty responses (proto3 omits empty lists)', async () => {
    const adapter = build({
      listAwardsByProjects: jest.fn().mockResolvedValue({}),
      listCategoriesByIds: jest.fn().mockResolvedValue({}),
    });

    expect(await adapter.listAwardsByProjects([1])).toEqual([]);
    expect(await adapter.listCategoriesByIds([1])).toEqual([]);
  });
});
