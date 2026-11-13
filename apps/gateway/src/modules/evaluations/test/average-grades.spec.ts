import { of } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { EvaluationsService } from '../evaluations.service';

describe('EvaluationsService.getAverageGrades', () => {
  const build = (
    topProjects?: {
      projectId: number;
      averageGrade: number;
      evaluationCount: number;
    }[],
  ) => {
    const evaluationGrpc = {
      getTopProjectsByCourse: jest.fn().mockReturnValue(of({ topProjects })),
    };
    const client = (service: unknown) =>
      ({ getService: () => service }) as unknown as ClientGrpc;
    const service = new EvaluationsService(
      client(evaluationGrpc),
      client({}),
      client({}),
    );
    service.onModuleInit();
    return { service, evaluationGrpc };
  };

  it('asks for every project in one call', async () => {
    const { service, evaluationGrpc } = build([]);

    await service.getAverageGrades([3, 4, 5]);

    expect(evaluationGrpc.getTopProjectsByCourse).toHaveBeenCalledTimes(1);
    expect(evaluationGrpc.getTopProjectsByCourse).toHaveBeenCalledWith({
      projectIds: [3, 4, 5],
    });
  });

  it('leaves out projects without evaluations and rounds as the ranking does', async () => {
    const { service } = build([
      { projectId: 3, averageGrade: 85.334, evaluationCount: 3 },
      { projectId: 4, averageGrade: 0, evaluationCount: 0 },
    ]);

    expect(await service.getAverageGrades([3, 4])).toEqual([
      { projectId: 3, averageGrade: 85.33 },
    ]);
  });

  it('does not call evaluation-service without projects', async () => {
    const { service, evaluationGrpc } = build([]);

    expect(await service.getAverageGrades([])).toEqual([]);
    expect(evaluationGrpc.getTopProjectsByCourse).not.toHaveBeenCalled();
  });

  it('handles an empty response (proto3 omits empty lists)', async () => {
    const { service } = build(undefined);

    expect(await service.getAverageGrades([3])).toEqual([]);
  });
});
