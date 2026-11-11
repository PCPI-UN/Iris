import { EventServiceAdapter } from './event-service.adapter';
import { EventGrpcClient } from './event.grpc-client';
import { EventStatus } from '@app/common/generated/event';

describe('EventServiceAdapter (student dashboard)', () => {
  const build = (grpc: Partial<Record<keyof EventGrpcClient, jest.Mock>>) =>
    new EventServiceAdapter(grpc as unknown as EventGrpcClient);

  it('treats a missing active flag as a deleted event (proto3 omits false)', async () => {
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
        ],
      }),
    });

    const events = await adapter.listEventsByIds([1, 2]);

    expect(events).toEqual([
      {
        id: 1,
        name: 'A',
        startDate: 's',
        endDate: 'e',
        active: true,
        finished: true,
      },
      {
        id: 2,
        name: 'B',
        startDate: 's',
        endDate: 'e',
        active: false,
        finished: false,
      },
    ]);
  });

  it('accepts the CLOSED status as a string too', async () => {
    const adapter = build({
      listEventsByIds: jest.fn().mockResolvedValue({
        events: [{ id: 1, active: true, status: 'CLOSED' }],
      }),
    });

    const [event] = await adapter.listEventsByIds([1]);

    expect(event.finished).toBe(true);
  });

  it('returns empty lists without calling event-service when there are no ids', async () => {
    const listEventsByIds = jest.fn();
    const listAwardsByProjects = jest.fn();
    const adapter = build({ listEventsByIds, listAwardsByProjects });

    expect(await adapter.listEventsByIds([])).toEqual([]);
    expect(await adapter.listAwardsByProjects([])).toEqual([]);
    expect(listEventsByIds).not.toHaveBeenCalled();
    expect(listAwardsByProjects).not.toHaveBeenCalled();
  });

  it('handles an empty awards response (proto3 omits empty lists)', async () => {
    const adapter = build({
      listAwardsByProjects: jest.fn().mockResolvedValue({}),
    });

    expect(await adapter.listAwardsByProjects([1])).toEqual([]);
  });
});
