import { GetProjectStatsUseCase } from '../get-project-stats.use-case';
import {
  EvaluationRepositoryPort,
  ProjectStats,
} from '../../../domain/repositories/evaluation.repository.port';
import { StatsEvaluation } from '../../../domain/services/criteria-stats';
import {
  buildResolver,
  customScale,
  InMemoryGradingScaleRepository,
} from '../../../../grading-scales/testing/grading-scales.fixture';

describe('GetProjectStatsUseCase', () => {
  const evaluation = (scores: [number, number]): StatsEvaluation => ({
    details: scores.map((score, i) => ({
      criterionId: i + 1,
      criterionName: `Criterio ${i + 1}`,
      componentId: 10,
      componentName: 'Planos y Cálculo',
      score,
      // Relative weights 2 and 1 inside a component of 0.4
      weight: i === 0 ? 0.4 * (2 / 3) : 0.4 * (1 / 3),
    })),
  });

  const build = (
    stats: ProjectStats,
    evaluations: StatsEvaluation[],
    scaleId = 1,
  ) => {
    const repo = {
      getProjectStats: jest.fn().mockResolvedValue(stats),
      findEvaluationsForStats: jest
        .fn()
        .mockResolvedValue(evaluations.length ? [evaluations] : []),
    };
    const scales = new InMemoryGradingScaleRepository();
    scales.scales.set(50, customScale(50, [10, 20, 30, 40]));
    scales.eventScales.set(3, scaleId);
    const uc = new GetProjectStatsUseCase(
      repo as unknown as EvaluationRepositoryPort,
      buildResolver(scales),
    );
    return { uc, repo };
  };

  const evaluated: ProjectStats = {
    averageGrade: 61.33,
    evaluationCount: 1,
    evaluatorIds: [7],
    eventId: 3,
  };

  it('returns the weighted average of each component with its criteria', async () => {
    const { uc, repo } = build(evaluated, [evaluation([90, 55])]);

    const result = await uc.execute({ projectId: 5 });

    expect(repo.getProjectStats).toHaveBeenCalledWith(5);
    expect(repo.findEvaluationsForStats).toHaveBeenCalledWith([5]);
    expect(result).toMatchObject({
      averageGrade: 61.33,
      evaluationCount: 1,
      evaluatorIds: [7],
    });
    expect(result).not.toHaveProperty('eventId');
    // (90·2 + 55·1) / 3, not the plain average 72.5
    expect(result.components).toEqual([
      expect.objectContaining({
        id: 10,
        average: 78.33,
        projectCount: 1,
        criteria: [
          expect.objectContaining({ id: 1, average: 90 }),
          expect.objectContaining({ id: 2, average: 55 }),
        ],
      }),
    ]);
  });

  it.each<[string, number, number]>([
    ['Proyectos finales', 1, 90],
    ['Cero a cinco', 2, 5],
    ['Cero a cien', 3, 100],
    ['a custom scale', 50, 40],
  ])(
    'uses the highest level of %s as maxScore',
    async (_name, scaleId, max) => {
      const { uc } = build(evaluated, [evaluation([4, 3])], scaleId);

      const result = await uc.execute({ projectId: 5 });

      expect(result.maxScore).toBe(max);
    },
  );

  it('returns no components and maxScore 0 when the project has no evaluations', async () => {
    const { uc } = build(
      { averageGrade: 0, evaluationCount: 0, evaluatorIds: [], eventId: null },
      [],
    );

    const result = await uc.execute({ projectId: 5 });

    expect(result).toEqual({
      averageGrade: 0,
      evaluationCount: 0,
      evaluatorIds: [],
      components: [],
      maxScore: 0,
    });
  });
});
