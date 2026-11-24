import { FindByCourseUseCase } from '../find-by-course.use-case';
import { Criterion } from '../../../domain/entities/criterion.entity';
import { Component } from '../../../domain/entities/component.entity';
import { CriterionRepositoryPort } from '../../../domain/repositories/criterion.repository.port';
import { CriterionMapper } from '../../mappers/criterion.mapper';

describe('FindByCourseUseCase', () => {
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

  const run = (criteria: Criterion[], components: Component[]) => {
    const repository = {
      findByCourseId: jest.fn().mockResolvedValue(criteria),
      findComponentsByEvent: jest
        .fn()
        .mockImplementation((eventId: number) =>
          Promise.resolve(
            components.filter((component) => component.eventId === eventId),
          ),
        ),
    } as unknown as CriterionRepositoryPort;
    return new FindByCourseUseCase(repository).execute({ courseId: 5 });
  };

  it('gives each criterion its effective weight: component weight × relative weight ÷ Σ relative weights', async () => {
    const { effectiveWeights } = await run(
      [
        criterion(1, 11),
        criterion(2, 13, 10),
        criterion(3, 13, 9),
        criterion(4, 13, 9),
      ],
      [
        new Component(11, 'Comunicación Escrita', 0.7, 1),
        new Component(13, 'Comunicación Oral', 0.3, 1),
      ],
    );

    expect(effectiveWeights.get(1)).toBeCloseTo(0.7);
    expect(effectiveWeights.get(2)).toBeCloseTo(0.1071, 4);
    expect(effectiveWeights.get(3)).toBeCloseTo(0.0964, 4);
    expect(effectiveWeights.get(4)).toBeCloseTo(0.0964, 4);
  });

  it('uses the components of the criterion event only', async () => {
    const { effectiveWeights } = await run(
      [criterion(1, 11, 1, 1), criterion(2, 21, 1, 2)],
      [
        new Component(11, 'Escrito', 0.5, 1),
        new Component(21, 'Escrito', 1, 2),
      ],
    );

    expect(effectiveWeights.get(1)).toBeCloseTo(0.5);
    expect(effectiveWeights.get(2)).toBeCloseTo(1);
  });

  it('a criterion without component has no weight', async () => {
    const { effectiveWeights } = await run([criterion(5, null)], []);

    expect(effectiveWeights.has(5)).toBe(false);
  });

  it('the response carries the weight on each criterion and the component weight on each group', async () => {
    const result = await run(
      [criterion(1, 13), criterion(5, null)],
      [new Component(13, 'Comunicación Oral', 0.3, 1)],
    );

    const response = CriterionMapper.toFindCriterionsByCourseResponse(
      result.criterions,
      result.components,
      result.effectiveWeights,
    );

    expect(response.categories).toEqual([
      {
        category: 'Comunicación Oral',
        weight: 0.3,
        criterions: [{ id: 1, name: 'Criterion 1', weight: 0.3 }],
      },
      {
        category: 'Uncategorized',
        weight: 0,
        criterions: [{ id: 5, name: 'Criterion 5' }],
      },
    ]);
  });
});
