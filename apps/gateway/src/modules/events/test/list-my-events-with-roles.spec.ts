import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import { EventService } from '../events.service';
import { ListMyEventsWithRolesDTO } from '../dto/events/list-my-events-with-roles.dto';

describe('GET /me/events', () => {
  const errorsFor = async (query: Record<string, unknown>) =>
    (await validate(plainToInstance(ListMyEventsWithRolesDTO, query))).map((e) => e.property);

  it('requires status to be current or past', async () => {
    expect(await errorsFor({})).toEqual(['status']);
    expect(await errorsFor({ status: 'all' })).toEqual(['status']);
    expect(await errorsFor({ status: 'current' })).toEqual([]);
    expect(await errorsFor({ status: 'past' })).toEqual([]);
  });

  it('rejects a limit above 50 and a page below 1', async () => {
    expect(await errorsFor({ status: 'current', limit: '51' })).toEqual(['limit']);
    expect(await errorsFor({ status: 'current', page: '0' })).toEqual(['page']);
  });

  it('forwards the user and flattens each event with its roles, without the access code', async () => {
    const eventGrpc = {
      listMyEventsWithRoles: jest.fn(() =>
        of({
          events: [{ event: { id: 12, name: 'Feria', accessCode: 'X7K2' }, roles: ['JURY', 'TUTOR'] }],
          meta: { total: 1, itemsOnCurrentPage: 1, itemsPerPage: 10, currentPage: 1, totalPages: 1 },
        }),
      ),
    };
    const grpcClient = { getService: jest.fn(() => eventGrpc) };
    const service = new EventService(grpcClient as any, grpcClient as any, grpcClient as any, {} as any, {} as any);
    service.onModuleInit();

    const result = await service.listMyEventsWithRoles(7, { status: 'past', page: 2, limit: 5 });

    expect(eventGrpc.listMyEventsWithRoles).toHaveBeenCalledWith({ userId: 7, status: 'past', page: 2, limit: 5 });
    expect(result.events).toEqual([{ id: 12, name: 'Feria', roles: ['JURY', 'TUTOR'] }]);
    expect(result.meta?.total).toBe(1);
  });
});
