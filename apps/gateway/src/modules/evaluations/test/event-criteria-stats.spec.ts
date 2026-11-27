import { of, throwError } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { EvaluationsService } from '../evaluations.service';

describe('EvaluationsService.getEventCriteriaStats', () => {
  const component = {
    id: 10,
    name: 'Planos y Cálculo',
    weight: 0.4,
    average: 78.33,
    projectCount: 2,
  };

  /** pages: project ids of each page returned by project-service */
  const build = (
    pages: number[][],
    response: object,
    getEvent: unknown = of({ event: { id: 7 } }),
  ) => {
    const projectsGrpc = {
      listProjectsByEvent: jest.fn(
        ({ currentPage }: { currentPage: number }) => {
          const ids = pages[currentPage - 1] ?? [];
          return of({
            items: ids.length ? ids.map((id) => ({ id })) : undefined,
            totalPages: pages.length,
          });
        },
      ),
    };
    const evaluationGrpc = {
      getEventCriteriaStats: jest.fn().mockReturnValue(of(response)),
    };
    const eventsGrpc = { getEvent: jest.fn().mockReturnValue(getEvent) };
    const client = (service: unknown) =>
      ({ getService: () => service }) as unknown as ClientGrpc;
    const service = new EvaluationsService(
      client(evaluationGrpc),
      client({}),
      client(projectsGrpc),
      client(eventsGrpc),
    );
    service.onModuleInit();
    return { service, projectsGrpc, evaluationGrpc };
  };

  it('averages every project of the event, in any state, page by page', async () => {
    const { service, projectsGrpc, evaluationGrpc } = build([[3, 4], [5]], {
      maxScore: 90,
      components: [component],
      // the academic fields do not reach this endpoint
      evaluatedCount: 3,
      distribution: [{ from: 0, to: 18, count: 3 }],
    });

    const result = await service.getEventCriteriaStats(7);

    // No state filter
    expect(projectsGrpc.listProjectsByEvent).toHaveBeenCalledWith({
      eventId: 7,
      courseId: undefined,
      currentPage: 1,
      itemsPerPage: 100,
    });
    expect(projectsGrpc.listProjectsByEvent).toHaveBeenCalledTimes(2);
    expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith({
      eventId: 7,
      projectIds: [3, 4, 5],
      groups: [],
    });
    expect(result).toEqual({
      maxScore: 90,
      components: [{ ...component, criteria: [] }],
    });
  });

  it('filters by category', async () => {
    const { service, projectsGrpc } = build([[3]], { components: [] });

    await service.getEventCriteriaStats(7, 2);

    expect(projectsGrpc.listProjectsByEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 7, courseId: 2 }),
    );
  });

  it('still returns the scale when the event has no projects, and no maxScore without scale (proto3 omits empty values)', async () => {
    const withScale = build([], { maxScore: 100 });
    expect(await withScale.service.getEventCriteriaStats(7)).toEqual({
      maxScore: 100,
      components: [],
    });
    expect(withScale.evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds: [] }),
    );

    const withoutScale = build([], {});
    expect(await withoutScale.service.getEventCriteriaStats(7)).toEqual({
      components: [],
    });
  });

  it('fails when the event does not exist', async () => {
    const notFound = Object.assign(new Error('No se encontró el evento'), {
      code: 5,
    });
    const { service, evaluationGrpc } = build(
      [],
      {},
      throwError(() => notFound),
    );

    await expect(service.getEventCriteriaStats(99)).rejects.toBe(notFound);
    expect(evaluationGrpc.getEventCriteriaStats).not.toHaveBeenCalled();
  });

  describe('getCriteriaStatsByGroups', () => {
    it('sends the groups in one call and fills the lists proto3 omits', async () => {
      const { service, evaluationGrpc } = build([], {
        maxScore: 5,
        evaluatedCount: 2,
        components: [component],
        distribution: [{ from: 0, to: 1, count: 2 }],
        groups: [{ evaluatedCount: 2, components: [component] }, {}],
      });

      const result = await service.getCriteriaStatsByGroups(
        7,
        [3, 4],
        [[3], [4]],
      );

      expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledTimes(1);
      expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith({
        eventId: 7,
        projectIds: [3, 4],
        groups: [{ projectIds: [3] }, { projectIds: [4] }],
      });
      expect(result).toEqual({
        maxScore: 5,
        evaluatedCount: 2,
        components: [{ ...component, criteria: [] }],
        distribution: [{ from: 0, to: 1, count: 2 }],
        groups: [
          {
            evaluatedCount: 2,
            components: [{ ...component, criteria: [] }],
            distribution: [],
          },
          { evaluatedCount: 0, components: [], distribution: [] },
        ],
      });
    });
  });
});
