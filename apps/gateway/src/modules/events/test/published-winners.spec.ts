import { of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { EventService } from '../events.service';
import { EventsController } from '../events.controller';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

/**
 * CU-86e3wzr5x: public winners view across events, enriched with project names.
 */
describe('GET /events/public/winners', () => {
  const grpcResponse = {
    events: [
      {
        eventId: 9,
        name: 'Feria 2026',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-03T00:00:00.000Z',
        categories: [
          {
            categoryId: 7,
            name: 'Software',
            awards: [
              {
                awardId: 11,
                title: 'Primer lugar',
                position: 1,
                coWinners: true,
                winners: [
                  { winnerId: 1, projectId: 100, grade: 95 },
                  { winnerId: 2, projectId: 101, grade: 95 },
                ],
              },
            ],
          },
        ],
      },
      {
        eventId: 4,
        name: 'Feria 2025',
        startDate: '2025-10-01T00:00:00.000Z',
        endDate: '2025-10-03T00:00:00.000Z',
        categories: [
          {
            categoryId: 3,
            name: 'Hardware',
            // gRPC leaves out false booleans and unset optional fields
            awards: [
              {
                awardId: 20,
                title: 'Primer lugar',
                position: 1,
                winners: [{ winnerId: 5, projectId: 100 }],
              },
            ],
          },
        ],
      },
    ],
    meta: {
      total: 2,
      itemsOnCurrentPage: 2,
      itemsPerPage: 10,
      currentPage: 1,
      totalPages: 1,
    },
  };

  const buildService = (response: unknown = grpcResponse) => {
    const eventGrpc = { listPublishedWinners: jest.fn(() => of(response)) };
    const grpcClient = {
      getService: jest.fn((name: string) =>
        name === 'EventService' ? eventGrpc : {},
      ),
    };
    const projectsService = {
      // project 101 could not be read
      getProjectNamesByIds: jest.fn(() =>
        Promise.resolve(new Map([[100, 'Robot clasificador']])),
      ),
    };
    const service = new EventService(
      grpcClient as any,
      grpcClient as any,
      grpcClient as any,
      projectsService as any,
      {} as any,
    );
    service.onModuleInit();
    return { service, eventGrpc, projectsService };
  };

  describe('EventService.listPublishedWinners', () => {
    it('passes the page through and adds each project name', async () => {
      const { service, eventGrpc, projectsService } = buildService();

      const result = await service.listPublishedWinners({ page: 2, limit: 5 });

      expect(eventGrpc.listPublishedWinners).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
      });
      expect(projectsService.getProjectNamesByIds).toHaveBeenCalledWith([
        100, 101, 100,
      ]);
      expect(result.events.map((event) => event.eventId)).toEqual([9, 4]);
      expect(result.events[0].categories[0].awards[0]).toEqual({
        awardId: 11,
        title: 'Primer lugar',
        position: 1,
        coWinners: true,
        winners: [
          {
            winnerId: 1,
            projectId: 100,
            projectName: 'Robot clasificador',
            grade: 95,
          },
          { winnerId: 2, projectId: 101, projectName: null, grade: 95 },
        ],
      });
      expect(result.meta.total).toBe(2);
    });

    it('returns null grades and false coWinners when gRPC leaves them out', async () => {
      const { service } = buildService();

      const result = await service.listPublishedWinners({});
      const award = result.events[1].categories[0].awards[0];

      expect(award.coWinners).toBe(false);
      expect(award.winners[0].grade).toBeNull();
    });

    it('does not look projects up when there are no winners', async () => {
      const { service, projectsService } = buildService({
        meta: { total: 0, currentPage: 1, itemsPerPage: 10 },
      });

      const result = await service.listPublishedWinners({ page: 1, limit: 10 });

      expect(result.events).toEqual([]);
      expect(projectsService.getProjectNamesByIds).not.toHaveBeenCalled();
    });
  });

  describe('EventsController.listPublishedWinners', () => {
    const handler = Object.getOwnPropertyDescriptor(
      EventsController.prototype,
      'listPublishedWinners',
    )?.value as () => unknown;

    it('is public', () => {
      expect(new Reflector().get(IS_PUBLIC_KEY, handler)).toBe(true);
    });

    it('delegates to the service with the query', async () => {
      const eventsService = {
        listPublishedWinners: jest.fn().mockResolvedValue({ events: [] }),
      };
      const controller = new EventsController(eventsService as any);

      await controller.listPublishedWinners({ page: 3, limit: 20 });

      expect(eventsService.listPublishedWinners).toHaveBeenCalledWith({
        page: 3,
        limit: 20,
      });
    });

    it('is declared before public/:id so "winners" is not parsed as an id', () => {
      const methods = Object.getOwnPropertyNames(EventsController.prototype);
      expect(methods.indexOf('listPublishedWinners')).toBeLessThan(
        methods.indexOf('getPublicEvent'),
      );
    });
  });
});
