import { CriterionMapper } from '../criterion.mapper';
import { Criterion } from '../../../domain/entities/criterion.entity';
import { Component } from '../../../domain/entities/component.entity';

describe('CriterionMapper.toFindCriterionsByCourseResponse', () => {
  const criterion = (
    id: number,
    componentId: number | null,
    weight = 1,
    eventId = 1,
  ) =>
    new Criterion(
      id,
      eventId,
      `Criterion ${id}`,
      null,
      weight,
      true,
      null,
      componentId,
      new Date(),
      new Date(),
    );

  const weightsById = (
    response: ReturnType<
      typeof CriterionMapper.toFindCriterionsByCourseResponse
    >,
  ) =>
    Object.fromEntries(
      response.categories.flatMap((category) =>
        category.criterions.map((c) => [c.id, c.weight]),
      ),
    );

  it('gives each criterion its effective weight: component weight × relative weight ÷ Σ relative weights', () => {
    const components = [
      new Component(11, 'Comunicación Escrita', 0.7, 1),
      new Component(13, 'Comunicación Oral', 0.3, 1),
    ];
    const criteria = [
      criterion(1, 11),
      criterion(2, 13, 10),
      criterion(3, 13, 9),
      criterion(4, 13, 9),
    ];

    const weights = weightsById(
      CriterionMapper.toFindCriterionsByCourseResponse(criteria, components),
    );

    expect(weights[1]).toBeCloseTo(0.7);
    expect(weights[2]).toBeCloseTo(0.1071, 4);
    expect(weights[3]).toBeCloseTo(0.0964, 4);
    expect(weights[4]).toBeCloseTo(0.0964, 4);
  });

  it('keeps the component weight on each group', () => {
    const response = CriterionMapper.toFindCriterionsByCourseResponse(
      [criterion(1, 13)],
      [new Component(13, 'Comunicación Oral', 0.3, 1)],
    );

    expect(response.categories).toEqual([
      {
        category: 'Comunicación Oral',
        weight: 0.3,
        criterions: [{ id: 1, name: 'Criterion 1', weight: 0.3 }],
      },
    ]);
  });

  it('a criterion without component has no weight', () => {
    const response = CriterionMapper.toFindCriterionsByCourseResponse(
      [criterion(5, null)],
      [],
    );

    expect(response.categories[0].category).toBe('Uncategorized');
    expect(response.categories[0].criterions[0]).not.toHaveProperty('weight');
  });

  it('uses the components of the criterion event only', () => {
    const components = [
      new Component(11, 'Escrito', 0.5, 1),
      new Component(21, 'Escrito', 1, 2),
    ];
    const criteria = [criterion(1, 11, 1, 1), criterion(2, 21, 1, 2)];

    const weights = weightsById(
      CriterionMapper.toFindCriterionsByCourseResponse(criteria, components),
    );

    expect(weights[1]).toBeCloseTo(0.5);
    expect(weights[2]).toBeCloseTo(1);
  });
});
