import { of } from 'rxjs';
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

  const build = (projectIds: number[], response: object) => {
    const projectsGrpc = {
      listProjectsByEvent: jest.fn().mockReturnValue(
        of({
          items: projectIds.length
            ? projectIds.map((id) => ({ id }))
            : undefined,
        }),
      ),
    };
    const evaluationGrpc = {
      getEventCriteriaStats: jest.fn().mockReturnValue(of(response)),
    };
    const client = (service: unknown) =>
      ({ getService: () => service }) as unknown as ClientGrpc;
    const service = new EvaluationsService(
      client(evaluationGrpc),
      client({}),
      client(projectsGrpc),
    );
    service.onModuleInit();
    return { service, projectsGrpc, evaluationGrpc };
  };

  it('averages every project of the event, in any state, without criteria', async () => {
    const { service, projectsGrpc, evaluationGrpc } = build([3, 4], {
      maxScore: 90,
      components: [component],
    });

    const result = await service.getEventCriteriaStats(7);

    // No state filter
    expect(projectsGrpc.listProjectsByEvent).toHaveBeenCalledWith({
      eventId: 7,
      courseId: undefined,
      currentPage: 1,
      itemsPerPage: 1000,
    });
    expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith({
      eventId: 7,
      projectIds: [3, 4],
      withCriteria: false,
    });
    expect(result).toEqual({
      maxScore: 90,
      components: [{ ...component, criteria: [] }],
    });
  });

  it('filters by category and asks for the criteria', async () => {
    const { service, projectsGrpc, evaluationGrpc } = build([3], {
      maxScore: 5,
      components: [],
    });

    await service.getEventCriteriaStats(7, 2);

    expect(projectsGrpc.listProjectsByEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 7, courseId: 2 }),
    );
    expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith({
      eventId: 7,
      projectIds: [3],
      withCriteria: true,
    });
  });

  it('still returns the scale when the event has no projects (proto3 omits empty lists)', async () => {
    const { service, evaluationGrpc } = build([], { maxScore: 100 });

    const result = await service.getEventCriteriaStats(7);

    expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith(
      expect.objectContaining({ projectIds: [] }),
    );
    expect(result).toEqual({ maxScore: 100, components: [] });
  });
});
