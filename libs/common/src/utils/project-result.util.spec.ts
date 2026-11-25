import { groupByComponent, splitFeedback } from './project-result.util';

const criteria = [
  {
    criterionId: 1,
    criterion: 'Claridad',
    component: 'Exposición',
    weight: 0.2,
    score: 80,
  },
  {
    criterionId: 2,
    criterion: 'Dominio',
    component: 'Exposición',
    weight: 0.3,
    score: 90,
  },
  {
    criterionId: 3,
    criterion: 'Diseño',
    component: 'Solución',
    weight: 0.5,
    score: 85,
  },
];

describe('groupByComponent', () => {
  it('groups criteria and sums the component weight from its criteria', () => {
    expect(groupByComponent({ criteria })).toEqual([
      {
        component: 'Exposición',
        weight: 0.5,
        criteria: [
          { criterionId: 1, criterion: 'Claridad', weight: 0.2, score: 80 },
          { criterionId: 2, criterion: 'Dominio', weight: 0.3, score: 90 },
        ],
      },
      {
        component: 'Solución',
        weight: 0.5,
        criteria: [
          { criterionId: 3, criterion: 'Diseño', weight: 0.5, score: 85 },
        ],
      },
    ]);
  });

  it('keeps the effective weights as stored when they do not add up to 1', () => {
    const weights = [0.057, 0.057, 0.057, 0.057, 0.057, 0.057, 0.057];
    const grouped = groupByComponent({
      criteria: weights.map((weight, index) => ({
        criterionId: index + 1,
        criterion: `C${index}`,
        component: 'Descripción del Diseño',
        weight,
        score: 80,
      })),
    });

    expect(grouped).toHaveLength(1);
    expect(grouped[0].weight).toBe(0.399);
    expect(grouped[0].criteria.every((c) => c.weight === 0.057)).toBe(true);
  });

  it('names a criterion without component', () => {
    const [component] = groupByComponent({
      criteria: [
        {
          criterionId: 1,
          criterion: 'Uno',
          component: '',
          weight: 1,
          score: 3,
        },
      ],
    });
    expect(component.component).toBe('Sin componente');
  });
});

describe('splitFeedback', () => {
  it('returns each juror comment trimmed and drops empty ones', () => {
    expect(splitFeedback(' Uno \n\n\n\nDos\n\n ')).toEqual(['Uno', 'Dos']);
    expect(splitFeedback('')).toEqual([]);
    expect(splitFeedback(undefined)).toEqual([]);
  });

  it('keeps single line breaks inside a comment', () => {
    expect(splitFeedback('Línea 1\nLínea 2\n\nOtro')).toEqual([
      'Línea 1\nLínea 2',
      'Otro',
    ]);
  });
});
