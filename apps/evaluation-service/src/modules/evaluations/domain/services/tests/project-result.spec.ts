import { ResultEvaluation, buildProjectResult } from '../project-result';

describe('buildProjectResult', () => {
  const evaluation = (
    grade: number,
    comments: string | null,
    scores: Record<number, number>,
  ): ResultEvaluation => ({
    grade,
    comments,
    details: Object.entries(scores).map(([id, score]) => ({
      criterionId: Number(id),
      criterionName: `Criterion ${id}`,
      componentName: Number(id) < 3 ? 'Desarrollo' : 'Comunicación',
      score,
      weight: 0.25,
    })),
  });

  it('returns an empty result when no juror evaluated the project', () => {
    expect(buildProjectResult([])).toEqual({
      evaluated: false,
      finalScore: 0,
      criteria: [],
      consolidatedFeedback: '',
    });
  });

  it('averages the grades with the ranking rounding', () => {
    const result = buildProjectResult([
      evaluation(80, null, {}),
      evaluation(75, null, {}),
      evaluation(70.01, null, {}),
    ]);

    expect(result.evaluated).toBe(true);
    expect(result.finalScore).toBe(75);
  });

  it('averages each criterion across jurors, with its component and weight', () => {
    const result = buildProjectResult([
      evaluation(80, null, { 1: 90, 2: 75, 3: 55 }),
      evaluation(70, null, { 1: 75, 2: 75, 3: 90 }),
    ]);

    expect(result.criteria).toEqual([
      {
        criterionId: 3,
        criterion: 'Criterion 3',
        component: 'Comunicación',
        weight: 0.25,
        score: 72.5,
      },
      {
        criterionId: 1,
        criterion: 'Criterion 1',
        component: 'Desarrollo',
        weight: 0.25,
        score: 82.5,
      },
      {
        criterionId: 2,
        criterion: 'Criterion 2',
        component: 'Desarrollo',
        weight: 0.25,
        score: 75,
      },
    ]);
  });

  it('joins the comments in one anonymous text and skips empty ones', () => {
    const result = buildProjectResult([
      evaluation(80, '  Buena solución.  ', {}),
      evaluation(70, null, {}),
      evaluation(75, '   ', {}),
      evaluation(75, 'Ampliar las pruebas.', {}),
    ]);

    expect(result.consolidatedFeedback).toBe(
      'Buena solución.\n\nAmpliar las pruebas.',
    );
  });

  it('never exposes juror data', () => {
    const result = buildProjectResult([evaluation(80, 'Bien', { 1: 90 })]);

    expect(Object.keys(result).sort()).toEqual([
      'consolidatedFeedback',
      'criteria',
      'evaluated',
      'finalScore',
    ]);
  });
});
