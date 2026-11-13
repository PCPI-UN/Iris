import { GetRubricReadinessUseCase } from '../get-rubric-readiness.use-case';
import { Criterion } from '../../../domain/entities/criterion.entity';
import { Component } from '../../../domain/entities/component.entity';
import { CriterionRepositoryPort } from '../../../domain/repositories/criterion.repository.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';

describe('GetRubricReadinessUseCase', () => {
    const criterion = (id: number, componentId: number | null, weight = 1) =>
        new Criterion(id, 1, `Criterion ${id}`, null, weight, true, null, componentId, new Date(), new Date());

    const components = [
        new Component(11, 'Comunicación Escrita', 0.3, 1),
        new Component(12, 'Descripción del Diseño', 0.4, 1),
        new Component(13, 'Comunicación Oral', 0.3, 1),
    ];

    const buildUseCase = (
        eventComponents: Component[],
        criteria: Array<{ criterion: Criterion; courseIds: number[] }>,
        eventCourseIds: number[] = Array.from(new Set(criteria.flatMap(({ courseIds }) => courseIds))),
    ) => {
        const repository = {
            findComponentsByEvent: jest.fn().mockResolvedValue(eventComponents),
            findActiveByEventWithCourses: jest.fn().mockResolvedValue(criteria),
        } as unknown as CriterionRepositoryPort;
        const eventService = {
            listCourseIdsByEvent: jest.fn().mockResolvedValue(eventCourseIds),
            validateCoursesBelongToEvent: jest.fn().mockImplementation((courseIds: number[]) =>
                Promise.resolve({
                    valid: courseIds.every((id) => id !== 99),
                    invalidCourses: courseIds.filter((id) => id === 99),
                }),
            ),
        } as unknown as EventServicePort;
        return new GetRubricReadinessUseCase(repository, eventService);
    };

    it('marks a category ready when the components add up to 100% and each one has a criterion', async () => {
        const useCase = buildUseCase(components, [
            { criterion: criterion(1, 11), courseIds: [10, 20] },
            { criterion: criterion(2, 12), courseIds: [10, 20] },
            { criterion: criterion(3, 13, 10), courseIds: [10] },
            { criterion: criterion(4, 13, 9), courseIds: [10] },
        ]);

        const result = await useCase.execute({ eventId: 1 });

        expect(result.componentsWeight).toBeCloseTo(1, 10);
        expect(result.categories).toEqual([
            { courseId: 10, ready: true, criteriaCount: 4, missingComponentIds: [], criteriaWithoutComponent: [] },
            { courseId: 20, ready: false, criteriaCount: 2, missingComponentIds: [13], criteriaWithoutComponent: [] },
        ]);
    });

    it('marks every category not ready when the components do not add up to 100%', async () => {
        const useCase = buildUseCase(
            [components[0], new Component(12, 'Descripción del Diseño', 0.399, 1), new Component(13, 'Oral', 0.28, 1)],
            [
                { criterion: criterion(1, 11), courseIds: [10] },
                { criterion: criterion(2, 12), courseIds: [10] },
                { criterion: criterion(3, 13), courseIds: [10] },
            ],
        );

        const result = await useCase.execute({ eventId: 1 });

        expect(result.componentsWeight).toBeCloseTo(0.979, 10);
        expect(result.categories[0].ready).toBe(false);
        expect(result.categories[0].missingComponentIds).toEqual([]);
    });

    it('reports criteria without component', async () => {
        const useCase = buildUseCase(components, [
            { criterion: criterion(1, 11), courseIds: [10] },
            { criterion: criterion(2, 12), courseIds: [10] },
            { criterion: criterion(3, 13), courseIds: [10] },
            { criterion: criterion(4, null), courseIds: [10] },
        ]);

        const result = await useCase.execute({ eventId: 1 });

        expect(result.categories[0]).toEqual(
            expect.objectContaining({ ready: false, criteriaWithoutComponent: [4] }),
        );
    });

    it('returns the requested category even when it has no criteria', async () => {
        const useCase = buildUseCase(components, [{ criterion: criterion(1, 11), courseIds: [10] }]);

        const result = await useCase.execute({ eventId: 1, courseId: 30 });

        expect(result.categories).toEqual([
            { courseId: 30, ready: false, criteriaCount: 0, missingComponentIds: [11, 12, 13], criteriaWithoutComponent: [] },
        ]);
    });

    it('reports the categories of the event without any criterion as not ready', async () => {
        const useCase = buildUseCase(
            components,
            [
                { criterion: criterion(1, 11), courseIds: [10] },
                { criterion: criterion(2, 12), courseIds: [10] },
                { criterion: criterion(3, 13), courseIds: [10] },
            ],
            [10, 30],
        );

        const result = await useCase.execute({ eventId: 1 });

        expect(result.categories).toEqual([
            expect.objectContaining({ courseId: 10, ready: true }),
            { courseId: 30, ready: false, criteriaCount: 0, missingComponentIds: [11, 12, 13], criteriaWithoutComponent: [] },
        ]);
    });

    it('rejects a course that does not belong to the event', async () => {
        const useCase = buildUseCase(components, []);

        await expect(useCase.execute({ eventId: 1, courseId: 99 })).rejects.toEqual(
            expect.objectContaining({
                error: expect.objectContaining({ message: 'La categoría 99 no pertenece al evento 1' }),
            }),
        );
    });
});
