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
import { Criterion } from '../../../domain/entities/criterion.entity';
import { Component } from '../../../domain/entities/component.entity';
import { CriterionRepositoryPort } from '../../../domain/repositories/criterion.repository.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';

/**
 * Rules for managing criteria and components (CU-86e3vmxar / IRIS-V3-EVAL-02):
 * - a component weight is configured and split in equal parts among its criteria,
 * - component weights of an event cannot exceed 100%,
 * - the rubric of an event cannot change once it has evaluations.
 */
describe('Criteria and components CRUD - rules', () => {
    const buildCriterion = (overrides: Partial<Criterion> = {}): Criterion =>
        Object.assign(
            new Criterion(1, 1, 'Criterion', null, 0.1, true, null, null, new Date(), new Date()),
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

    beforeEach(() => {
        criterionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByCourseId: jest.fn().mockResolvedValue([]),
            findByCourseIds: jest.fn(),
            associateCourses: jest.fn(),
            removeAllCourseAssociations: jest.fn(),
            getCriterionCourses: jest.fn().mockResolvedValue([]),
            createComponent: jest.fn(),
            findComponentById: jest.fn(),
            findAllComponents: jest.fn(),
            updateComponent: jest.fn(),
            deleteComponent: jest.fn(),
            countActiveCriteriaInComponent: jest.fn().mockResolvedValue(0),
            sumComponentWeightsByEvent: jest.fn().mockResolvedValue(0),
            hasEvaluationsForEvent: jest.fn().mockResolvedValue(false),
            hasEvaluationsForComponent: jest.fn().mockResolvedValue(false),
        } as jest.Mocked<CriterionRepositoryPort>;

        eventService = {
            getEvent: jest.fn().mockResolvedValue({ id: 1 }),
            validateCoursesBelongToEvent: jest.fn().mockResolvedValue({ valid: true, invalidCourses: [] }),
        } as unknown as jest.Mocked<EventServicePort>;

        criterionRepository.create.mockImplementation((criterion) =>
            Promise.resolve(buildCriterion({ ...criterion, id: 100 })),
        );
        criterionRepository.update.mockImplementation((criterion) => Promise.resolve(criterion));
    });

    describe('weight validation', () => {
        it.each([
            [CreateCriterionDto, { eventId: 1, name: 'Criterion', weight: 50, courseIds: [] }],
            [UpdateCriterionDto, { id: 1, weight: 50 }],
        ])('%p rejects weights above 1', async (dtoClass, payload) => {
            const errors = await validate(plainToInstance(dtoClass as any, payload));

            expect(errors.map((error) => error.property)).toContain('weight');
        });

        it('rejects a standalone criterion when the course total would exceed 100%', async () => {
            criterionRepository.findByCourseId.mockResolvedValue([
                buildCriterion({ id: 1, weight: 0.6 }),
                buildCriterion({ id: 2, weight: 0.3 }),
            ]);

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);

            await expect(
                useCase.execute({ eventId: 1, name: 'Extra', weight: 0.2, courseIds: [10] }),
            ).rejects.toThrow(RpcException);
            expect(criterionRepository.create).not.toHaveBeenCalled();
        });

        it('does not use the weight sent by the client for a criterion inside a component', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(5, 'Oral', 0.3, 1));

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);
            await useCase.execute({ eventId: 1, name: 'Claridad', weight: 0.9, courseIds: [10], componentId: 5 });

            // The repository derives the real weight (component weight / active criteria)
            expect(criterionRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({ componentId: 5, weight: 0 }),
            );
            expect(criterionRepository.findByCourseId).not.toHaveBeenCalled();
        });

        it('rejects a component that belongs to another event', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(5, 'Oral', 0.3, 2));

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);

            await expect(
                useCase.execute({ eventId: 1, name: 'Claridad', weight: 0.1, courseIds: [], componentId: 5 }),
            ).rejects.toEqual(rpcError(status.INVALID_ARGUMENT, 'does not belong to event 1'));
        });

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
    });

    describe('rubric locked once the event has evaluations', () => {
        beforeEach(() => {
            criterionRepository.hasEvaluationsForEvent.mockResolvedValue(true);
            criterionRepository.hasEvaluationsForComponent.mockResolvedValue(true);
            criterionRepository.findById.mockResolvedValue(buildCriterion({ weight: 0.1 }));
            criterionRepository.getCriterionCourses.mockResolvedValue([{ criterion_id: 1, course_id: 10 }] as any);
            criterionRepository.findComponentById.mockResolvedValue(new Component(5, 'Oral', 0.3, 1));
        });

        it('rejects creating a criterion', async () => {
            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);

            await expect(
                useCase.execute({ eventId: 1, name: 'Extra', weight: 0.1, courseIds: [10] }),
            ).rejects.toEqual(rpcError(status.FAILED_PRECONDITION, 'already has evaluations'));
        });

        it.each([
            ['weight', { weight: 0.2 }],
            ['active', { active: false }],
            ['courses', { courseIds: [10, 11] }],
            ['component', { componentId: 5 }],
        ])('rejects changing the %s of a criterion', async (_field, change) => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);

            await expect(useCase.execute({ id: 1, ...change })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already has evaluations'),
            );
            expect(criterionRepository.update).not.toHaveBeenCalled();
        });

        it('still allows renaming a criterion when the client resends the unchanged values', async () => {
            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);

            const result = await useCase.execute({ id: 1, name: 'Renamed', weight: 0.1, courseIds: [10], active: true });

            expect(result.criterion.name).toBe('Renamed');
        });

        it('rejects deleting a criterion', async () => {
            const useCase = new DeleteCriterionUseCase(criterionRepository);

            await expect(useCase.execute({ id: 1 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already has evaluations'),
            );
            expect(criterionRepository.delete).not.toHaveBeenCalled();
        });

        it('rejects changing a component weight but allows renaming it', async () => {
            const useCase = new UpdateComponentUseCase(criterionRepository);
            criterionRepository.updateComponent.mockImplementation((component) => Promise.resolve(component));

            await expect(useCase.execute({ id: 5, weight: 0.4 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already used in evaluations'),
            );
            await expect(useCase.execute({ id: 5, name: 'Comunicación Oral' })).resolves.toEqual(
                expect.objectContaining({ name: 'Comunicación Oral', weight: 0.3 }),
            );
        });

        it('rejects deleting a component', async () => {
            const useCase = new DeleteComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 5 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'already used in evaluations'),
            );
            expect(criterionRepository.deleteComponent).not.toHaveBeenCalled();
        });
    });

    describe('updating criteria', () => {
        it('keeps the current courses when the gateway sends an empty course list', async () => {
            criterionRepository.findById.mockResolvedValue(buildCriterion());
            criterionRepository.getCriterionCourses.mockResolvedValue([{ criterion_id: 1, course_id: 10 }] as any);

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);
            const result = await useCase.execute({ id: 1, name: 'Renamed', courseIds: [] });

            expect(criterionRepository.removeAllCourseAssociations).not.toHaveBeenCalled();
            expect(result.courseIds).toEqual([10]);
        });

        it('keeps the gRPC code of domain errors instead of masking them as INTERNAL', async () => {
            criterionRepository.findById.mockResolvedValue(buildCriterion());
            criterionRepository.update.mockRejectedValue(
                new RpcException({ code: status.FAILED_PRECONDITION, message: 'domain error' }),
            );

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);

            await expect(useCase.execute({ id: 1, name: 'Renamed' })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'domain error'),
            );
        });

        it('masks unexpected errors as INTERNAL', async () => {
            criterionRepository.findById.mockResolvedValue(buildCriterion());
            criterionRepository.update.mockRejectedValue(new Error('connection reset'));

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);

            await expect(useCase.execute({ id: 1, name: 'Renamed' })).rejects.toEqual(
                rpcError(status.INTERNAL, 'Failed to update criterion'),
            );
        });
    });

    describe('components', () => {
        it('saves the weight requested for the component', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(1, 'Oral', 0.28, 1));
            criterionRepository.updateComponent.mockImplementation((component) => Promise.resolve(component));

            const useCase = new UpdateComponentUseCase(criterionRepository);
            const result = await useCase.execute({ id: 1, weight: 0.3 });

            expect(result.weight).toBe(0.3);
            expect(criterionRepository.updateComponent).toHaveBeenCalledWith(
                expect.objectContaining({ id: 1, weight: 0.3 }),
            );
        });

        it('rejects deleting a component that still has active criteria', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(1, 'Oral', 0.3, 1));
            criterionRepository.countActiveCriteriaInComponent.mockResolvedValue(3);

            const useCase = new DeleteComponentUseCase(criterionRepository);

            await expect(useCase.execute({ id: 1 })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'still has 3 active criteria'),
            );
            expect(criterionRepository.deleteComponent).not.toHaveBeenCalled();
        });

        it('deletes an empty component without evaluations', async () => {
            criterionRepository.findComponentById.mockResolvedValue(new Component(1, 'Oral', 0.3, 1));

            const useCase = new DeleteComponentUseCase(criterionRepository);
            await useCase.execute({ id: 1 });

            expect(criterionRepository.deleteComponent).toHaveBeenCalledWith(1);
        });
    });
});
