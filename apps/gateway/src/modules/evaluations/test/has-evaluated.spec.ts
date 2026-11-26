import { of } from 'rxjs';
import { ClientGrpc } from '@nestjs/microservices';
import { EvaluationsService } from '../evaluations.service';

describe('EvaluationsService.hasEvaluated', () => {
  const build = (projects?: { projectId: number; evaluated: boolean }[]) => {
    const evaluationGrpc = {
      checkEvaluationStatus: jest.fn().mockReturnValue(of({ projects })),
    };
    const client = (service: unknown) =>
      ({ getService: () => service }) as unknown as ClientGrpc;
    const service = new EvaluationsService(
      client(evaluationGrpc),
      client({}),
      client({}),
      client({}),
    );
    service.onModuleInit();
    return { service, evaluationGrpc };
  };

  it('asks for the juror, the event and the one project', async () => {
    const { service, evaluationGrpc } = build([
      { projectId: 7, evaluated: true },
    ]);

    expect(await service.hasEvaluated(21, 4, 7)).toBe(true);
    expect(evaluationGrpc.checkEvaluationStatus).toHaveBeenCalledWith({
      userId: 21,
      eventId: 4,
      projectIds: [7],
    });
  });

  it('false when the juror has not evaluated or the answer is empty', async () => {
    expect(
      await build([{ projectId: 7, evaluated: false }]).service.hasEvaluated(
        21,
        4,
        7,
      ),
    ).toBe(false);
    expect(await build(undefined).service.hasEvaluated(21, 4, 7)).toBe(false);
  });
});
