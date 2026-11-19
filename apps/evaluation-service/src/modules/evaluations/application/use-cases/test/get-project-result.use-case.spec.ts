import { RpcException } from '@nestjs/microservices';
import { GetProjectResultUseCase } from '../get-project-result.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';
import {
  buildResolver,
  customScale,
  InMemoryGradingScaleRepository,
} from '../../../../grading-scales/testing/grading-scales.fixture';

describe('GetProjectResultUseCase', () => {
  const build = (
    scaleId = 1,
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
    const scales = new InMemoryGradingScaleRepository();
    scales.scales.set(50, customScale(50, [10, 20, 30, 40]));
    scales.eventScales.set(3, scaleId);
    const uc = new GetProjectResultUseCase(
      repo as unknown as EvaluationRepositoryPort,
      projects as unknown as ProjectServicePort,
      buildResolver(scales),
    );
    return { uc, repo, projects };
  };

  it('reads the evaluations of the project', async () => {
    const { uc, repo } = build();

    const result = await uc.execute({ projectId: 5 });

    expect(repo.findProjectEvaluationsForResult).toHaveBeenCalledWith(5);
    expect(result).toMatchObject({
      evaluated: true,
      finalScore: 80,
      consolidatedFeedback: 'Bien',
    });
  });

  it.each<[string, number, number]>([
    ['Proyectos finales', 1, 90],
    ['Cero a cinco', 2, 5],
    ['Cero a cien', 3, 100],
    ['a custom scale', 50, 40],
  ])('uses the highest level of %s as maxScore', async (_name, scaleId, max) => {
    const { uc } = build(scaleId);

    const result = await uc.execute({ projectId: 5 });

    expect(result.maxScore).toBe(max);
  });

  it('fails with NOT_FOUND when the project does not exist', async () => {
    const { uc, repo } = build(1, null);

    await expect(uc.execute({ projectId: 5 })).rejects.toBeInstanceOf(
      RpcException,
    );
    expect(repo.findProjectEvaluationsForResult).not.toHaveBeenCalled();
  });
});
