import { GetEventCriteriaStatsUseCase } from '../get-event-criteria-stats.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { StatsEvaluation } from '../../../domain/services/criteria-stats';
import {
  buildResolver,
  customScale,
  InMemoryGradingScaleRepository,
} from '../../../../grading-scales/testing/grading-scales.fixture';

describe('GetEventCriteriaStatsUseCase', () => {
  const evaluation = (score: number): StatsEvaluation => ({
    details: [
      {
        criterionId: 1,
        criterionName: 'Problema',
        componentId: 10,
        componentName: 'Fundamentación',
        score,
        weight: 0.4,
      },
    ],
  });

  const build = (scaleId = 1) => {
    const repo = {
      findEvaluationsForStats: jest
        .fn()
        .mockResolvedValue([
          [evaluation(80), evaluation(60)],
          [evaluation(90)],
        ]),
    };
    const scales = new InMemoryGradingScaleRepository();
    scales.scales.set(50, customScale(50, [10, 20, 30, 40]));
    scales.eventScales.set(3, scaleId);
    const uc = new GetEventCriteriaStatsUseCase(
      repo as unknown as EvaluationRepositoryPort,
      buildResolver(scales),
    );
    return { uc, repo };
  };

  it('averages the components of the given projects', async () => {
    const { uc, repo } = build();

    const result = await uc.execute({ eventId: 3, projectIds: [5, 6] });

    expect(repo.findEvaluationsForStats).toHaveBeenCalledWith([5, 6]);
    expect(result.components).toEqual([
      {
        id: 10,
        name: 'Fundamentación',
        weight: 0.4,
        average: 80,
        projectCount: 2,
      },
    ]);
  });

  it('returns the criteria only when requested', async () => {
    const { uc } = build();

    const result = await uc.execute({
      eventId: 3,
      projectIds: [5, 6],
      withCriteria: true,
    });

    expect(result.components[0].criteria).toEqual([
      { id: 1, name: 'Problema', weight: 0.4, average: 80 },
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
      const { uc } = build(scaleId);

      const result = await uc.execute({ eventId: 3, projectIds: [5] });

      expect(result.maxScore).toBe(max);
    },
  );

  it('does not query the evaluations when the event has no projects', async () => {
    const { uc, repo } = build();

    const result = await uc.execute({ eventId: 3 });

    expect(repo.findEvaluationsForStats).not.toHaveBeenCalled();
    expect(result).toEqual({ maxScore: 90, components: [] });
  });
});
