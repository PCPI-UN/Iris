import { RpcException } from '@nestjs/microservices';
import { EvaluationType as EventEvaluationType } from '@app/common/generated/event';
import { GetProjectResultUseCase } from '../get-project-result.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';

describe('GetProjectResultUseCase', () => {
  const build = (
    evaluationType?: EventEvaluationType,
    project: object | null = { id: 5, eventId: 3 },
  ) => {
    const repo = {
      findProjectEvaluationsForResult: jest.fn().mockResolvedValue([
        {
          grade: 80,
          comments: 'Bien',
          details: [
            {
              criterionId: 1,
              criterionName: 'Problema',
              componentName: 'Fundamentación',
              score: 75,
              weight: 0.4,
            },
          ],
        },
      ]),
    };
    const projects = { getProject: jest.fn().mockResolvedValue(project) };
    const events = {
      getEvent: jest.fn().mockResolvedValue({ id: 3, evaluationType }),
    };
    const uc = new GetProjectResultUseCase(
      repo as unknown as EvaluationRepositoryPort,
      projects as unknown as ProjectServicePort,
      events,
    );
    return { uc, repo, projects, events };
  };

  it('reads the evaluations of the project and the event of the project', async () => {
    const { uc, repo, events } = build(EventEvaluationType.FINAL_PROJECTS);

    const result = await uc.execute({ projectId: 5 });

    expect(repo.findProjectEvaluationsForResult).toHaveBeenCalledWith(5);
    expect(events.getEvent).toHaveBeenCalledWith(3);
    expect(result).toMatchObject({
      evaluated: true,
      finalScore: 80,
      consolidatedFeedback: 'Bien',
    });
  });

  it.each([
    [EventEvaluationType.FINAL_PROJECTS, 90],
    [EventEvaluationType.ZERO_TO_FIVE, 5],
    [EventEvaluationType.ZERO_TO_HUNDRED, 100],
    [undefined, 90],
  ])('uses the highest grade of the type %p as maxScore', async (type, max) => {
    const { uc } = build(type);

    const result = await uc.execute({ projectId: 5 });

    expect(result.maxScore).toBe(max);
  });

  it('fails with NOT_FOUND when the project does not exist', async () => {
    const { uc, repo } = build(EventEvaluationType.FINAL_PROJECTS, null);

    await expect(uc.execute({ projectId: 5 })).rejects.toBeInstanceOf(
      RpcException,
    );
    expect(repo.findProjectEvaluationsForResult).not.toHaveBeenCalled();
  });
});
