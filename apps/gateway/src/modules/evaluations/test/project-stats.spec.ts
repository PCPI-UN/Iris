import { of, throwError } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { EvaluationsService } from '../evaluations.service';

describe('EvaluationsService.getProjectStats', () => {
  const stats = {
    projectId: 3,
    averageGrade: 78.33,
    evaluationCount: 1,
    evaluatorIds: [4],
  };
  const component = {
    id: 10,
    name: 'Planos y Cálculo',
    weight: 0.4,
    average: 78.33,
    projectCount: 1,
    criteria: [{ id: 1, name: 'Planos', weight: 0.4, average: 78.33 }],
  };

  const build = (
    criteriaResponse: object,
    getProject = of({ project: { id: 3, eventId: 7 } }),
  ) => {
    const evaluationGrpc = {
      getProjectStats: jest.fn().mockReturnValue(of(stats)),
      getEventCriteriaStats: jest.fn().mockReturnValue(of(criteriaResponse)),
    };
    const projectsGrpc = { getProject: jest.fn().mockReturnValue(getProject) };
    const client = (service: unknown) =>
      ({ getService: () => service }) as unknown as ClientGrpc;
    const service = new EvaluationsService(
      client(evaluationGrpc),
      client({}),
      client(projectsGrpc),
      client({}),
    );
    service.onModuleInit();
    return { service, evaluationGrpc };
  };

  it('adds the components of the project and the scale of its event', async () => {
    const { service, evaluationGrpc } = build({
      maxScore: 90,
      components: [component],
    });

    const result = await service.getProjectStats(3);

    expect(evaluationGrpc.getEventCriteriaStats).toHaveBeenCalledWith({
      eventId: 7,
      projectIds: [3],
    });
    expect(result).toEqual({ ...stats, maxScore: 90, components: [component] });
  });

  it('returns no maxScore when the event has no scale, and an empty list without evaluations (proto3 omits both)', async () => {
    const { service } = build({});

    const result = await service.getProjectStats(3);

    expect(result).not.toHaveProperty('maxScore');
    expect(result.components).toEqual([]);
  });

  it('fails when the project does not exist', async () => {
    const notFound = Object.assign(new Error('No se encontró el proyecto'), {
      code: 5,
    });
    const { service, evaluationGrpc } = build(
      {},
      throwError(() => notFound),
    );

    await expect(service.getProjectStats(3)).rejects.toBe(notFound);
    expect(evaluationGrpc.getEventCriteriaStats).not.toHaveBeenCalled();
  });
});
