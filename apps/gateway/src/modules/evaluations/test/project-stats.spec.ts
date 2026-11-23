import { of } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { EvaluationsService } from '../evaluations.service';

describe('EvaluationsService.getProjectStats', () => {
  const build = (response: object) => {
    const evaluationGrpc = {
      getProjectStats: jest.fn().mockReturnValue(of(response)),
    };
    const client = (service: unknown) =>
      ({ getService: () => service }) as unknown as ClientGrpc;
    const service = new EvaluationsService(
      client(evaluationGrpc),
      client({}),
      client({}),
    );
    service.onModuleInit();
    return service;
  };

  it('returns an empty list of components for a project without evaluations (proto3 omits it)', async () => {
    const service = build({
      projectId: 3,
      averageGrade: 0,
      evaluationCount: 0,
      maxScore: 0,
    });

    expect(await service.getProjectStats(3)).toEqual({
      projectId: 3,
      averageGrade: 0,
      evaluationCount: 0,
      maxScore: 0,
      components: [],
    });
  });
});
