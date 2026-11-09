import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCriterionUseCase } from '../create-criterion.use-case';
import { UpdateCriterionUseCase } from '../update-criterion.use-case';
import { DeleteCriterionUseCase } from '../delete-criterion.use-case';
import { CreateComponentUseCase } from '../create-component.use-case';
import { UpdateComponentUseCase } from '../update-component.use-case';
import { DeleteComponentUseCase } from '../delete-component.use-case';
import { CreateCriterionDto } from '../../dto/create-criterion.dto';
import { UpdateCriterionDto } from '../../dto/update-criterion.dto';
import { CreateComponentDto } from '../../dto/create-component.dto';
import { Criterion } from '../../../domain/entities/criterion.entity';
import { Component } from '../../../domain/entities/component.entity';
import { CriterionRepositoryPort } from '../../../domain/repositories/criterion.repository.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';
import { ProjectServicePort } from '../../../infrastructure/ports/project.service.port';
import { CategoryLockService } from '../../services/category-lock.service';

/**
 * Rules for managing criteria and components (CU-86e3vmxar / IRIS-V3-EVAL-02):
 * - a component belongs to one event and has a weight (fraction of the grade);
 *   the components of an event cannot exceed 100%,
 * - every criterion belongs to a component of its event and has a relative weight
 *   (1 by default) that is never rewritten,
 * - the criteria of a category cannot change once a project of that category has been
 *   evaluated, while its rubric is complete (texts can); the components of an event, once
 *   the event has evaluations,
 * - an evaluated category whose rubric is not complete can still be fixed (nobody can
 *   evaluate it until it is complete),
 * - while the components of an evaluated event do not add up to 100% they can still be
 *   fixed (no grade was computed with an incomplete rubric).
 */
describe('Criteria and components CRUD - rules', () => {
    const buildCriterion = (overrides: Partial<Criterion> = {}): Criterion =>
        Object.assign(
            new Criterion(1, 1, 'Criterion', null, 1, true, null, 5, new Date(), new Date()),
            overrides,
        );

    const rpcError = (code: number, message?: string) =>
        expect.objectContaining({
            error: expect.objectContaining({
                code,
                ...(message && { message: expect.stringContaining(message) }),
            }),
        });

    let criterionRepository: jest.Mocked<CriterionRepositoryPort>;
    let eventService: jest.Mocked<EventServicePort>;
    let projectService: jest.Mocked<ProjectServicePort>;
    let categoryLock: CategoryLockService;

    beforeEach(() => {
        criterionRepository = {
            create: jest.fn(),
            findById: jest.fn().mockResolvedValue(buildCriterion()),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByCourseId: jest.fn().mockResolvedValue([]),
            findByCourseIds: jest.fn(),
            findActiveByEventWithCourses: jest.fn(),
            associateCourses: jest.fn(),
            removeAllCourseAssociations: jest.fn(),
            getCriterionCourses: jest.fn().mockResolvedValue([{ criterion_id: 1, course_id: 10 }]),
            createComponent: jest.fn(),
            findComponentById: jest.fn().mockResolvedValue(new Component(5, 'Oral', 0.3, 1)),
            findAllComponents: jest.fn(),
            findComponentsByEvent: jest.fn(),
            updateComponent: jest.fn().mockImplementation((component) => Promise.resolve(component)),
            deleteComponent: jest.fn(),
            countActiveCriteriaInComponent: jest.fn().mockResolvedValue(0),
            sumComponentWeightsByEvent: jest.fn().mockResolvedValue(0),
            hasEvaluationsForEvent: jest.fn().mockResolvedValue(false),
            findEvaluatedProjectIds: jest.fn().mockResolvedValue([]),
            withRubricLock: jest.fn((_eventIds, _mode, work) => work()),
        } as jest.Mocked<CriterionRepositoryPort>;

        projectService = {
            getProjectCategories: jest.fn().mockResolvedValue(new Map()),
        } as jest.Mocked<ProjectServicePort>;
        categoryLock = new CategoryLockService(criterionRepository, projectService);

        eventService = {
            getEvent: jest.fn().mockResolvedValue({ id: 1 }),
            validateCoursesBelongToEvent: jest.fn().mockResolvedValue({ valid: true, invalidCourses: [] }),
        } as unknown as jest.Mocked<EventServicePort>;

        criterionRepository.create.mockImplementation((criterion) =>
            Promise.resolve(buildCriterion({ ...criterion, id: 100 })),
        );
        criterionRepository.update.mockImplementation((criterion) => Promise.resolve(criterion));
    });

    describe('DTOs', () => {
        it('accepts relative criterion weights above 1 (e.g. 10 / 9 / 9)', async () => {
            const errors = await validate(
                plainToInstance(CreateCriterionDto, { eventId: 1, name: 'Claridad', weight: 10, courseIds: [10], componentId: 5 }),
            );

            expect(errors).toHaveLength(0);
        });

        it('requires the component of a new criterion', async () => {
            const errors = await validate(plainToInstance(CreateCriterionDto, { eventId: 1, name: 'Claridad', courseIds: [10] }));

            expect(errors.map((error) => error.property)).toContain('componentId');
        });

        it.each([
            [CreateCriterionDto, { eventId: 1, name: 'Claridad', weight: 0, courseIds: [10], componentId: 5 }],
            [UpdateCriterionDto, { id: 1, weight: -1 }],
        ])('%p rejects non-positive weights', async (dtoClass, payload) => {
            const errors = await validate(plainToInstance(dtoClass as any, payload));

            expect(errors.map((error) => error.property)).toContain('weight');
        });

        it('requires the event of a component and caps its weight at 1', async () => {
            const errors = await validate(plainToInstance(CreateComponentDto, { name: 'Oral', weight: 30 }));

            expect(errors.map((error) => error.property).sort()).toEqual(['eventId', 'weight']);
        });
    });

    describe('creating criteria', () => {
        it('uses a relative weight of 1 when none is sent', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await useCase.execute({ eventId: 1, name: 'Claridad', courseIds: [10], componentId: 5 });

            expect(criterionRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({ componentId: 5, weight: 1 }),
            );
        });

        it('keeps the relative weight sent by the client', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            const result = await useCase.execute({ eventId: 1, name: 'Claridad', weight: 10, courseIds: [10], componentId: 5 });

            expect(result.criterion.weight).toBe(10);
        });

        it('rejects a component that belongs to another event', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(5, 'Oral', 0.3, 2));

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(
                useCase.execute({ eventId: 1, name: 'Claridad', courseIds: [10], componentId: 5 }),
            ).rejects.toEqual(rpcError(status.INVALID_ARGUMENT, 'does not belong to event 1'));
        });

        it('drops duplicated courses', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            const result = await useCase.execute({ eventId: 1, name: 'Claridad', courseIds: [10, 10, 11], componentId: 5 });

            expect(result.courseIds).toEqual([10, 11]);
            expect(criterionRepository.associateCourses).toHaveBeenCalledWith(100, [10, 11]);
        });
    });

    describe('components', () => {
        it('rejects a component whose weight would push the event total over 100%', async () => {
            criterionRepository.sumComponentWeightsByEvent.mockResolvedValue(0.7);

            const useCase = new CreateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ name: 'Oral', weight: 0.4, eventId: 1 })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'would exceed 100%'),
            );
        });

        it('accepts components that complete exactly 100% (30 / 40 / 30)', async () => {
            criterionRepository.sumComponentWeightsByEvent.mockResolvedValue(0.3 + 0.4);
            criterionRepository.createComponent.mockResolvedValue(new Component(3, 'Oral', 0.3, 1));

            const useCase = new CreateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ name: 'Oral', weight: 0.3, eventId: 1 })).resolves.toBeInstanceOf(Component);
        });

        it('rejects raising a component weight over the 100% of the event', async () => {
            criterionRepository.sumComponentWeightsByEvent.mockResolvedValue(0.8);

            const useCase = new UpdateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5, weight: 0.4 })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'would exceed 100%'),
            );
        });

        it('allows lowering a component weight when the event is already over 100% (0.5 / 0.3 / 0.5)', async () => {
            criterionRepository.sumComponentWeightsByEvent.mockResolvedValue(0.5 + 0.5);

            const useCase = new UpdateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5, weight: 0.1 })).resolves.toEqual(
                expect.objectContaining({ id: 5, weight: 0.1 }),
            );
        });

        it('saves the weight requested for the component', async () => {
            const useCase = new UpdateComponentUseCase(criterionRepository);
            const result = await useCase.execute({ id: 5, weight: 0.4 });

            expect(result.weight).toBe(0.4);
        });

        it('keeps the event of a component when it is renamed', async () => {
            const useCase = new UpdateComponentUseCase(criterionRepository);
            await useCase.execute({ id: 5, name: 'Comunicación Oral' });

            expect(criterionRepository.updateComponent).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Comunicación Oral', eventId: 1, weight: 0.3 }),
            );
        });

        it('rejects deleting a component that still has active criteria', async () => {
            criterionRepository.countActiveCriteriaInComponent.mockResolvedValue(3);

            const useCase = new DeleteComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'still has 3 active criteria'),
            );
            expect(criterionRepository.deleteComponent).not.toHaveBeenCalled();
        });

        it('deletes an empty component of an event without evaluations', async () => {
            const useCase = new DeleteComponentUseCase(criterionRepository);
            await useCase.execute({ id: 5 });

            expect(criterionRepository.deleteComponent).toHaveBeenCalledWith(5);
        });
    });

    describe('rubric locked once the event has evaluations', () => {
        beforeEach(() => {
            // Project 100 (category 10) and project 101 (category 11) were evaluated; category 12 was not
            criterionRepository.findEvaluatedProjectIds.mockResolvedValue([100, 101]);
            projectService.getProjectCategories.mockResolvedValue(new Map([[100, 10], [101, 11], [102, 12]]));
            criterionRepository.hasEvaluationsForEvent.mockResolvedValue(true);
            // A complete rubric: the components of the event add up to 100%
            criterionRepository.sumComponentWeightsByEvent.mockResolvedValue(1);
            // ...and the evaluated categories 10 and 11 have a criterion in every component
            criterionRepository.findComponentsByEvent.mockResolvedValue([new Component(5, 'Oral', 1, 1)]);
            criterionRepository.findActiveByEventWithCourses.mockResolvedValue([
                { criterion: buildCriterion(), courseIds: [10, 11] },
            ]);
        });

        it('rejects creating a criterion', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(
                useCase.execute({ eventId: 1, name: 'Extra', courseIds: [10], componentId: 5 }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'Categories [10] of event 1 already have evaluations'));
        });

        it.each([
            ['weight', { weight: 2 }],
            ['active', { active: false }],
            ['courses', { courseIds: [12] }],
            ['component', { componentId: 6 }],
        ])('rejects changing the %s of a criterion instead of ignoring it', async (_field, change) => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, ...change })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already have evaluations'),
            );
            expect(criterionRepository.update).not.toHaveBeenCalled();
        });

        it('allows creating the criterion a category without evaluations is missing', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(
                useCase.execute({ eventId: 1, name: 'Oral', courseIds: [12], componentId: 5 }),
            ).resolves.toEqual(expect.objectContaining({ courseIds: [12] }));
        });

        it('allows adding a category without evaluations to a criterion of an evaluated one', async () => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, courseIds: [10, 12] })).resolves.toEqual(
                expect.objectContaining({ courseIds: [10, 12] }),
            );
        });

        it('allows removing a category without evaluations from a criterion shared with an evaluated one', async () => {
            criterionRepository.getCriterionCourses.mockResolvedValue([
                { criterion_id: 1, course_id: 10 },
                { criterion_id: 1, course_id: 12 },
            ] as any);

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, courseIds: [10] })).resolves.toEqual(
                expect.objectContaining({ courseIds: [10] }),
            );
        });

        it('rejects any change when the category of an evaluated project is unknown', async () => {
            projectService.getProjectCategories.mockResolvedValue(new Map([[100, 10]]));

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(
                useCase.execute({ eventId: 1, name: 'Oral', courseIds: [12], componentId: 5 }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'whose category is unknown'));
        });

        it('detects a change of courses hidden behind duplicated ids', async () => {
            criterionRepository.getCriterionCourses.mockResolvedValue([
                { criterion_id: 1, course_id: 10 },
                { criterion_id: 1, course_id: 11 },
            ] as any);

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, courseIds: [10, 10] })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'Categories [11]'),
            );
        });

        it('still allows renaming a criterion when the client resends the unchanged values', async () => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            const result = await useCase.execute({ id: 1, name: 'Renamed', weight: 1, courseIds: [10], active: true, componentId: 5 });

            expect(result.criterion.name).toBe('Renamed');
            expect(criterionRepository.removeAllCourseAssociations).not.toHaveBeenCalled();
        });

        it('rejects deleting a criterion', async () => {
            const useCase = new DeleteCriterionUseCase(criterionRepository, categoryLock);

            await expect(useCase.execute({ id: 1 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already have evaluations'),
            );
            expect(criterionRepository.delete).not.toHaveBeenCalled();
        });

        it('rejects creating a component', async () => {
            const useCase = new CreateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ name: 'Extra', weight: 0.1, eventId: 1 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already has evaluations'),
            );
        });

        it('rejects changing a component weight but allows renaming it', async () => {
            const useCase = new UpdateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5, weight: 0.4 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already has evaluations'),
            );
            await expect(useCase.execute({ id: 5, name: 'Comunicación Oral' })).resolves.toEqual(
                expect.objectContaining({ name: 'Comunicación Oral', weight: 0.3, eventId: 1 }),
            );
        });

        it('rejects deleting a component', async () => {
            const useCase = new DeleteComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already has evaluations'),
            );
            expect(criterionRepository.deleteComponent).not.toHaveBeenCalled();
        });
    });

    describe('evaluated category whose rubric is not complete', () => {
        // Report event: category 10 was evaluated with Diseño / Escrito / Oral; then a component
        // "Ajuste" (id 9) was created to reach 100%. Category 10 has no criterion in it, so nobody
        // can evaluate it, and the components can no longer change (they add up to 100%).
        const diseno = new Component(5, 'Diseño', 0.399, 1);
        const ajuste = new Component(9, 'Ajuste', 0.021, 1);
        const components = [diseno, new Component(6, 'Escrito', 0.3, 1), new Component(7, 'Oral', 0.28, 1), ajuste];
        const evaluatedRubric = [
            { criterion: buildCriterion({ id: 1, componentId: 5 }), courseIds: [10] },
            { criterion: buildCriterion({ id: 2, componentId: 6 }), courseIds: [10] },
            { criterion: buildCriterion({ id: 3, componentId: 7 }), courseIds: [10] },
        ];

        beforeEach(() => {
            criterionRepository.findEvaluatedProjectIds.mockResolvedValue([100]);
            projectService.getProjectCategories.mockResolvedValue(new Map([[100, 10]]));
            criterionRepository.hasEvaluationsForEvent.mockResolvedValue(true);
            criterionRepository.sumComponentWeightsByEvent.mockResolvedValue(1);
            criterionRepository.findComponentsByEvent.mockResolvedValue(components);
            criterionRepository.findActiveByEventWithCourses.mockResolvedValue(evaluatedRubric);
            criterionRepository.findComponentById.mockResolvedValue(ajuste);
        });

        it('allows adding the criterion the evaluated category is missing in the new component', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(
                useCase.execute({ eventId: 1, name: 'Ajuste Civil', courseIds: [10], componentId: 9 }),
            ).resolves.toEqual(expect.objectContaining({ courseIds: [10] }));
        });

        it('locks the category again once its rubric is complete', async () => {
            criterionRepository.findActiveByEventWithCourses.mockResolvedValue([
                ...evaluatedRubric,
                { criterion: buildCriterion({ id: 4, componentId: 9 }), courseIds: [10] },
            ]);

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(
                useCase.execute({ eventId: 1, name: 'Otro', courseIds: [10], componentId: 9 }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'Categories [10] of event 1 already have evaluations and a complete rubric'));
        });

        it('allows fixing the criteria of a category while the components of the event do not add up to 100%', async () => {
            // Event left at 0.979 by the rubric migration: no category is complete
            criterionRepository.findComponentsByEvent.mockResolvedValue(components.slice(0, 3));
            criterionRepository.findComponentById.mockResolvedValue(diseno);

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, weight: 2 })).resolves.toEqual(
                expect.objectContaining({ criterion: expect.objectContaining({ weight: 2 }) }),
            );
        });
    });

    describe('evaluated event whose components do not add up to 100%', () => {
        beforeEach(() => {
            // Event evaluated before the migration and left at 0.399 / 0.30 / 0.28 = 0.979
            criterionRepository.hasEvaluationsForEvent.mockResolvedValue(true);
            criterionRepository.findComponentById.mockResolvedValue(new Component(5, 'Diseño', 0.399, 1));
            criterionRepository.sumComponentWeightsByEvent.mockImplementation((_eventId, excludeComponentId) =>
                Promise.resolve(excludeComponentId === undefined ? 0.979 : 0.58),
            );
        });

        it('allows fixing a component weight so the remaining jurors can evaluate', async () => {
            const useCase = new UpdateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5, weight: 0.42 })).resolves.toEqual(
                expect.objectContaining({ id: 5, weight: 0.42 }),
            );
        });

        it('allows creating a missing component', async () => {
            criterionRepository.createComponent.mockResolvedValue(new Component(9, 'Extra', 0.021, 1));

            const useCase = new CreateComponentUseCase(criterionRepository);

            await expect(useCase.execute({ name: 'Extra', weight: 0.021, eventId: 1 })).resolves.toBeInstanceOf(Component);
        });

        it('allows deleting an empty component', async () => {
            const useCase = new DeleteComponentUseCase(criterionRepository);
            await useCase.execute({ id: 5 });

            expect(criterionRepository.deleteComponent).toHaveBeenCalledWith(5);
        });
    });

    describe('rubric lock', () => {
        it.each([
            ['creating a criterion', () => new CreateCriterionUseCase(criterionRepository, eventService, categoryLock).execute({ eventId: 1, name: 'Oral', courseIds: [10], componentId: 5 }), [1]],
            ['moving a criterion to another event', () => {
                criterionRepository.findComponentById.mockResolvedValue(new Component(20, 'Oral', 0.3, 2));
                return new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock).execute({ id: 1, eventId: 2, componentId: 20, courseIds: [40] });
            }, [1, 2]],
            ['deleting a criterion', () => new DeleteCriterionUseCase(criterionRepository, categoryLock).execute({ id: 1 }), [1]],
            ['creating a component', () => new CreateComponentUseCase(criterionRepository).execute({ name: 'Oral', weight: 0.3, eventId: 1 }), [1]],
            ['changing a component', () => new UpdateComponentUseCase(criterionRepository).execute({ id: 5, weight: 0.2 }), [1]],
            ['deleting a component', () => new DeleteComponentUseCase(criterionRepository).execute({ id: 5 }), [1]],
        ])('takes the exclusive rubric lock of the event when %s', async (_action, run, eventIds) => {
            criterionRepository.createComponent.mockResolvedValue(new Component(9, 'Oral', 0.3, 1));

            await run();

            expect(criterionRepository.withRubricLock).toHaveBeenCalledWith(eventIds, 'exclusive', expect.any(Function));
        });
    });

    describe('updating criteria', () => {
        it('does not ask project-service when the event has no evaluations', async () => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);
            await useCase.execute({ id: 1, weight: 2 });

            expect(projectService.getProjectCategories).not.toHaveBeenCalled();
        });

        it('keeps the current courses when the gateway sends an empty course list', async () => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);
            const result = await useCase.execute({ id: 1, name: 'Renamed', courseIds: [] });

            expect(criterionRepository.removeAllCourseAssociations).not.toHaveBeenCalled();
            expect(result.courseIds).toEqual([10]);
        });

        it('requires the categories of the new event when a criterion moves to another event', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(20, 'Oral', 0.3, 2));

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, eventId: 2, componentId: 20 })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'courseIds'),
            );
            expect(criterionRepository.update).not.toHaveBeenCalled();
        });

        it('moves a criterion to another event with categories of that event', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(20, 'Oral', 0.3, 2));

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);
            const result = await useCase.execute({ id: 1, eventId: 2, componentId: 20, courseIds: [40] });

            expect(eventService.validateCoursesBelongToEvent).toHaveBeenCalledWith([40], 2);
            expect(result).toEqual(expect.objectContaining({ courseIds: [40] }));
        });

        it('rejects removing the component of a criterion', async () => {
            criterionRepository.findById.mockResolvedValue(buildCriterion({ componentId: null }));

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, name: 'Renamed' })).rejects.toEqual(
                rpcError(status.INVALID_ARGUMENT, 'must belong to a component'),
            );
        });

        it('keeps the gRPC code of domain errors instead of masking them as INTERNAL', async () => {
            criterionRepository.update.mockRejectedValue(
                new RpcException({ code: status.FAILED_PRECONDITION, message: 'domain error' }),
            );

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, name: 'Renamed' })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'domain error'),
            );
        });

        it('masks unexpected errors as INTERNAL', async () => {
            criterionRepository.update.mockRejectedValue(new Error('connection reset'));

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService, categoryLock);

            await expect(useCase.execute({ id: 1, name: 'Renamed' })).rejects.toEqual(
                rpcError(status.INTERNAL, 'Failed to update criterion'),
            );
        });
    });
});
