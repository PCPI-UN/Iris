import { roundGrade } from '../../../../../common/utils/grade.utils';
import { StatsEvaluation, buildCriteriaStats } from '../criteria-stats';

describe('buildCriteriaStats', () => {
  // Rubric of the rubric test: "Planos y Cálculo" splits 0.4 between two criteria with relative weights 2 and 1
  const rubric = {
    1: {
      name: 'Planos',
      componentId: 10,
      component: 'Planos y Cálculo',
      weight: 0.4 * (2 / 3),
    },
    2: {
      name: 'Cálculo',
      componentId: 10,
      component: 'Planos y Cálculo',
      weight: 0.4 * (1 / 3),
    },
    3: {
      name: 'Prototipo',
      componentId: 20,
      component: 'Prototipo',
      weight: 0.3,
    },
    4: {
      name: 'Exposición',
      componentId: 30,
      component: 'Exposición',
      weight: 0.3,
    },
  };

  const evaluation = (scores: Record<number, number>): StatsEvaluation => ({
    grade: 0,
    details: Object.entries(scores).map(([id, score]) => {
      const criterion = rubric[Number(id) as keyof typeof rubric];
      return {
        criterionId: Number(id),
        criterionName: criterion.name,
        componentId: criterion.componentId,
        componentName: criterion.component,
        score,
        weight: criterion.weight,
      };
    }),
  });

  it('returns no components when no project was evaluated', () => {
    expect(buildCriteriaStats([])).toEqual([]);
    expect(buildCriteriaStats([[], []])).toEqual([]);
  });

  it('weights each criterion inside its component, so the components add up to the grade', () => {
    const components = buildCriteriaStats([
      [evaluation({ 1: 90, 2: 55, 3: 75, 4: 25 })],
    ]);

    expect(components).toMatchObject([
      {
        id: 10,
        name: 'Planos y Cálculo',
        weight: 0.4,
        average: 78.33,
        projectCount: 1,
      },
      { id: 20, name: 'Prototipo', weight: 0.3, average: 75, projectCount: 1 },
      { id: 30, name: 'Exposición', weight: 0.3, average: 25, projectCount: 1 },
    ]);
    // A plain average of 90 and 55 would give 72.5 and a grade of 61.25
    expect(
      roundGrade(components.reduce((acc, c) => acc + c.average * c.weight, 0)),
    ).toBe(61.33);
  });

  it('averages the jurors inside each project and then each project the same', () => {
    const twoJurors = [evaluation({ 3: 80 }), evaluation({ 3: 60 })];
    const oneJuror = [evaluation({ 3: 90 })];

    const [prototype] = buildCriteriaStats([twoJurors, oneJuror]);

    // (70 + 90) / 2, not (80 + 60 + 90) / 3 = 76.67
    expect(prototype).toMatchObject({ average: 80, projectCount: 2 });
  });

  it('leaves out the projects without evaluations', () => {
    const [prototype] = buildCriteriaStats([[evaluation({ 3: 60 })], []]);

    expect(prototype).toMatchObject({ average: 60, projectCount: 1 });
  });

  it('keeps the scale of the scores (2 to 5)', () => {
    const components = buildCriteriaStats([
      [evaluation({ 1: 5, 2: 2, 4: 3 }), evaluation({ 1: 4, 2: 4, 4: 4 })],
      [evaluation({ 1: 3, 2: 3, 4: 5 })],
    ]);

    // Project 1: juror A (5·2 + 2·1) / 3 = 4, juror B 4 → 4; project 2: 3 → (4 + 3) / 2
    expect(components).toEqual([
      expect.objectContaining({ id: 10, average: 3.5 }),
      expect.objectContaining({ id: 30, average: 4.25 }),
    ]);
  });

  it('returns each criterion with its effective weight, rounded to 4 decimals', () => {
    const projects = [
      [evaluation({ 1: 90, 2: 55 }), evaluation({ 1: 70, 2: 65 })],
      [evaluation({ 1: 60, 2: 100 })],
    ];

    const [component] = buildCriteriaStats(projects);
    expect(component.criteria).toEqual([
      { id: 1, name: 'Planos', weight: 0.2667, average: 70 },
      { id: 2, name: 'Cálculo', weight: 0.1333, average: 80 },
    ]);
  });

  it('groups the criteria without component in one row at the end', () => {
    const legacy: StatsEvaluation = {
      grade: 0,
      details: [
        {
          criterionId: 7,
          criterionName: 'Old',
          componentId: null,
          componentName: null,
          score: 50,
          weight: 0,
        },
      ],
    };

    const components = buildCriteriaStats([[evaluation({ 3: 70 }), legacy]]);

    expect(components.map((c) => c.id)).toEqual([20, null]);
    expect(components[1]).toMatchObject({ name: '', weight: 0, average: 50 });
  });
});
