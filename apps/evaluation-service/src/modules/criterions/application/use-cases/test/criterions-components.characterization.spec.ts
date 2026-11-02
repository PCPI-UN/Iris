import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCriterionUseCase } from '../create-criterion.use-case';
import { UpdateCriterionUseCase } from '../update-criterion.use-case';
import { UpdateComponentUseCase } from '../update-component.use-case';
import { DeleteComponentUseCase } from '../delete-component.use-case';
import { CreateCriterionDto } from '../../dto/create-criterion.dto';
import { UpdateCriterionDto } from '../../dto/update-criterion.dto';
import { Criterion } from '../../../domain/entities/criterion.entity';
import { Component } from '../../../domain/entities/component.entity';
import { CriterionRepositoryPort } from '../../../domain/repositories/criterion.repository.port';
import { EventServicePort } from '../../../infrastructure/ports/event.service.port';

/**
 * Characterization tests (CU-86e3vmxar / IRIS-V3-EVAL-02).
 *
 * They pin down the CURRENT behavior of the criteria and components CRUD,
 * including behavior identified as defective during the audit. Each test
 * that documents a defect carries an "After fix" note with the target behavior.
 */
describe('Criteria and components CRUD - characterization', () => {
    const buildCriterion = (overrides: Partial<Criterion> = {}): Criterion =>
        Object.assign(
            new Criterion(1, 1, 'Criterion', null, 0.1, true, null, null, new Date(), new Date()),
            overrides,
        );

    let criterionRepository: jest.Mocked<CriterionRepositoryPort>;
    let eventService: jest.Mocked<EventServicePort>;

    beforeEach(() => {
        criterionRepository = {
            create: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findByCourseId: jest.fn(),
            findByCourseIds: jest.fn(),
            associateCourses: jest.fn(),
            removeAllCourseAssociations: jest.fn(),
            getCriterionCourses: jest.fn(),
            createComponent: jest.fn(),
            findComponentById: jest.fn(),
            findAllComponents: jest.fn(),
            updateComponent: jest.fn(),
            deleteComponent: jest.fn(),
        } as jest.Mocked<CriterionRepositoryPort>;

        eventService = {
            getEvent: jest.fn().mockResolvedValue({ id: 1 }),
            validateCoursesBelongToEvent: jest.fn().mockResolvedValue({ valid: true, invalidCourses: [] }),
        } as unknown as jest.Mocked<EventServicePort>;

        criterionRepository.create.mockImplementation((criterion) =>
            Promise.resolve(buildCriterion({ ...criterion, id: 100 })),
        );
        criterionRepository.update.mockImplementation((criterion) => Promise.resolve(criterion));
        criterionRepository.getCriterionCourses.mockResolvedValue([]);
    });

    describe('weight validation (finding 5 and 6)', () => {
        it('CURRENT: CreateCriterionDto accepts weights up to 100 while the use case only accepts (0, 1]', async () => {
            // After fix: DTO and use case agree on the same range.
            const dto = plainToInstance(CreateCriterionDto, {
                eventId: 1,
                name: 'Criterion',
                weight: 50,
                courseIds: [],
            });

            expect(await validate(dto)).toHaveLength(0);

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);
            await expect(useCase.execute(dto)).rejects.toMatchObject({
                error: expect.objectContaining({ code: status.INVALID_ARGUMENT }),
            });
        });

        it('CURRENT: UpdateCriterionDto accepts weights up to 100', async () => {
            // After fix: DTO rejects weights above 1.
            const dto = plainToInstance(UpdateCriterionDto, { id: 1, weight: 50 });

            expect(await validate(dto)).toHaveLength(0);
        });

        it('rejects a new criterion when the course total would exceed 100%', async () => {
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

        it('CURRENT: skips the total weight validation entirely when no courseIds are sent', async () => {
            // After fix: totals are validated in the agreed scope (course or event) even without courseIds.
            criterionRepository.findByCourseId.mockResolvedValue([buildCriterion({ weight: 0.99 })]);

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);
            const result = await useCase.execute({ eventId: 1, name: 'Extra', weight: 0.5, courseIds: [] });

            expect(result.criterion.weight).toBe(0.5);
            expect(criterionRepository.findByCourseId).not.toHaveBeenCalled();
        });

        it('CURRENT: accepts a course whose criteria total less than 100% (e.g. the 0.979 rubric)', async () => {
            // After fix: depends on the business rule for totals below 1.
            criterionRepository.findByCourseId.mockResolvedValue([buildCriterion({ weight: 0.919 })]);

            const useCase = new CreateCriterionUseCase(criterionRepository, eventService);
            const result = await useCase.execute({ eventId: 1, name: 'Last', weight: 0.06, courseIds: [10] });

            expect(result.criterion.id).toBe(100);
        });
    });

    describe('updating criteria (finding 4 and 8)', () => {
        it('CURRENT: allows changing the weight without checking for existing evaluations', async () => {
            // After fix: block (or recalculate) when the event already has evaluations.
            criterionRepository.findById.mockResolvedValue(buildCriterion({ weight: 0.1 }));

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);
            const result = await useCase.execute({ id: 1, weight: 0.2 });

            expect(result.criterion.weight).toBe(0.2);
        });

        it('CURRENT: masks any repository error as INTERNAL', async () => {
            // After fix: domain errors keep their own gRPC code; only unexpected errors become INTERNAL.
            criterionRepository.findById.mockResolvedValue(buildCriterion());
            criterionRepository.update.mockRejectedValue(
                new RpcException({ code: status.FAILED_PRECONDITION, message: 'domain error' }),
            );

            const useCase = new UpdateCriterionUseCase(criterionRepository, eventService);

            await expect(useCase.execute({ id: 1, name: 'Renamed' })).rejects.toMatchObject({
                error: expect.objectContaining({
                    code: status.INTERNAL,
                    message: 'Failed to update criterion. Please try again later.',
                }),
            });
        });
    });

    describe('components (finding 7 and 8)', () => {
        it('CURRENT: UpdateComponentUseCase forwards the requested weight, but the repository recalculates it', async () => {
            // The use case validates and forwards the weight; PrismaCriterionRepository.updateComponent
            // then overwrites it with the sum of the active criteria (see repository characterization).
            // After fix: either the weight is not accepted as input, or it is honored.
            criterionRepository.findComponentById.mockResolvedValue(new Component(1, 'Oral', 0.28, 1));
            criterionRepository.updateComponent.mockImplementation((component) => Promise.resolve(component));

            const useCase = new UpdateComponentUseCase(criterionRepository);
            await useCase.execute({ id: 1, weight: 0.3 });

            expect(criterionRepository.updateComponent).toHaveBeenCalledWith(
                expect.objectContaining({ id: 1, weight: 0.3 }),
            );
        });

        it('CURRENT: deletes a component without checking whether criteria still reference it', async () => {
            // After fix: reject (or detach criteria first) when the component has criteria.
            criterionRepository.findComponentById.mockResolvedValue(new Component(1, 'Oral', 0.28, 1));

            const useCase = new DeleteComponentUseCase(criterionRepository);
            await useCase.execute({ id: 1 });

            expect(criterionRepository.deleteComponent).toHaveBeenCalledWith(1);
            expect(criterionRepository.findAll).not.toHaveBeenCalled();
        });
    });
});
