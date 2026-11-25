import { GetEventCriteriaStatsUseCase } from '../get-event-criteria-stats.use-case';
import { EvaluationRepositoryPort } from '../../../domain/repositories/evaluation.repository.port';
import { StatsEvaluation } from '../../../domain/services/criteria-stats';
import {
  customScale,
  InMemoryGradingScaleRepository,
} from '../../../../grading-scales/testing/grading-scales.fixture';

describe('GetEventCriteriaStatsUseCase', () => {
  const evaluation = (score: number, grade = score / 20): StatsEvaluation => ({
    grade,
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

  const build = (scaleId: number | null = 1) => {
    const repo = {
      findEvaluationsForStats: jest.fn().mockResolvedValue(
        new Map([
          [5, [evaluation(80), evaluation(60)]],
          [6, [evaluation(90)]],
        ]),
      ),
    };
    const scales = new InMemoryGradingScaleRepository();
    scales.scales.set(50, customScale(50, [10, 20, 30, 40]));
    if (scaleId !== null) scales.eventScales.set(3, scaleId);
    const uc = new GetEventCriteriaStatsUseCase(
      repo as unknown as EvaluationRepositoryPort,
      scales,
    );
    return { uc, repo };
  };

  it('averages the components and criteria of the given projects', async () => {
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
        criteria: [{ id: 1, name: 'Problema', weight: 0.4, average: 80 }],
      },
    ]);
  });

  it('still returns the averages without maxScore when the event has no grading scale', async () => {
    const { uc } = build(null);

    const result = await uc.execute({ eventId: 3, projectIds: [5, 6] });

    expect(result).not.toHaveProperty('maxScore');
    expect(result.components[0]).toMatchObject({
      average: 80,
      projectCount: 2,
    });
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
    expect(result).toEqual({
      maxScore: 90,
      evaluatedCount: 0,
      components: [],
      distribution: [
        { from: 0, to: 18, count: 0 },
        { from: 18, to: 36, count: 0 },
        { from: 36, to: 54, count: 0 },
        { from: 54, to: 72, count: 0 },
        { from: 72, to: 90, count: 0 },
      ],
      groups: [],
    });
  });

  it('spreads the final grades (average of the jurors) over the scale', async () => {
    const { uc } = build(2); // 0 to 5

    const result = await uc.execute({ eventId: 3, projectIds: [5, 6] });

    // 5: (4 + 3) / 2 = 3.5; 6: 4.5
    expect(result.evaluatedCount).toBe(2);
    expect(result.distribution.map((bucket) => bucket.count)).toEqual([
      0, 0, 0, 1, 1,
    ]);
  });

  it('has no distribution when the event has no grading scale', async () => {
    const { uc } = build(null);

    const result = await uc.execute({ eventId: 3, projectIds: [5, 6] });

    expect(result.distribution).toEqual([]);
  });

  it('gives the same stats per group, in order, reading the evaluations once', async () => {
    const { uc, repo } = build(2);

    const result = await uc.execute({
      eventId: 3,
      projectIds: [5, 6, 7],
      groups: [{ projectIds: [6] }, { projectIds: [5, 7] }, { projectIds: [] }],
    });

    expect(repo.findEvaluationsForStats).toHaveBeenCalledTimes(1);
    expect(repo.findEvaluationsForStats).toHaveBeenCalledWith([5, 6, 7]);
    expect(result.evaluatedCount).toBe(2);
    expect(result.groups).toHaveLength(3);
    expect(result.groups[0]).toMatchObject({ evaluatedCount: 1 });
    expect(result.groups[0].components[0]).toMatchObject({ average: 90 });
    expect(result.groups[0].distribution.map((b) => b.count)).toEqual([
      0, 0, 0, 0, 1,
    ]);
    // 7 has no evaluations: left out
    expect(result.groups[1]).toMatchObject({ evaluatedCount: 1 });
    expect(result.groups[1].components[0]).toMatchObject({ average: 70 });
    expect(result.groups[2]).toMatchObject({
      evaluatedCount: 0,
      components: [],
    });
  });
});
