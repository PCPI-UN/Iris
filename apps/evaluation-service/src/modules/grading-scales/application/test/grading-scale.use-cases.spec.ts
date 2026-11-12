import { status } from '@grpc/grpc-js';
import { EvaluationType } from '@app/common/generated/event';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { AssignEventGradingScaleUseCase } from '../use-cases/assign-event-grading-scale.use-case';
import { CreateGradingScaleUseCase } from '../use-cases/create-grading-scale.use-case';
import { DeleteGradingScaleUseCase } from '../use-cases/delete-grading-scale.use-case';
import { GetEventGradingScaleUseCase } from '../use-cases/get-event-grading-scale.use-case';
import { GetGradingScaleUseCase } from '../use-cases/get-grading-scale.use-case';
import { ListGradingScalesUseCase } from '../use-cases/list-grading-scales.use-case';
import { UpdateGradingScaleUseCase } from '../use-cases/update-grading-scale.use-case';
import { GradingScaleBackfillService } from '../grading-scale-backfill.service';
import {
    buildResolver,
    customScale,
    eventDirectory,
    InMemoryGradingScaleRepository,
} from '../../testing/grading-scales.fixture';

const levels = (points: number[]) =>
    points.map((value, index) => ({ level: index + 1, label: `Nivel ${index + 1}`, points: value }));

const rpcError = (code: number, message: string) =>
    expect.objectContaining({
        error: expect.objectContaining({ code, message: expect.stringContaining(message) }),
    });

describe('Grading scale use cases', () => {
    let repository: InMemoryGradingScaleRepository;
    let getEvent: jest.Mock;
    const withRubricLock = jest.fn((_eventIds: number[], _mode: string, work: () => Promise<unknown>) => work());
    const criterionRepository = { withRubricLock } as unknown as CriterionRepositoryPort;

    beforeEach(() => {
        jest.clearAllMocks();
        repository = new InMemoryGradingScaleRepository();
        getEvent = jest.fn().mockResolvedValue({ id: 7, evaluationType: EvaluationType.FINAL_PROJECTS });
    });

    const assign = () => new AssignEventGradingScaleUseCase(repository, criterionRepository, buildResolver(repository, getEvent));

    describe('list and get', () => {
        it('lists the 3 system scales, all locked', async () => {
            const scales = await new ListGradingScalesUseCase(repository).execute();

            expect(scales.map(({ scale }) => scale.name)).toEqual(['Proyectos finales', 'Cero a cinco', 'Cero a cien']);
            expect(scales.every(({ locked }) => locked)).toBe(true);
        });

        it('marks a catalog scale locked once an event using it has evaluations', async () => {
            repository.scales.set(50, customScale(50, [1, 2, 3, 4]));
            repository.eventScales.set(7, 50);
            const get = new GetGradingScaleUseCase(repository);

            expect((await get.execute(50)).locked).toBe(false);
            repository.evaluatedEvents.add(7);
            expect((await get.execute(50)).locked).toBe(true);
        });

        it('returns NOT_FOUND for an unknown scale', async () => {
            await expect(new GetGradingScaleUseCase(repository).execute(999)).rejects.toEqual(
                rpcError(status.NOT_FOUND, 'Grading scale 999 not found'),
            );
        });
    });

    describe('create', () => {
        it('creates a trimmed scale with its creator', async () => {
            const scale = await new CreateGradingScaleUseCase(repository).execute(
                { name: ' Decenas ', levels: levels([10, 20, 30, 40]).reverse() },
                3,
            );

            expect(scale).toMatchObject({ name: 'Decenas', isSystem: false, createdByUserId: 3 });
            expect(scale.levels.map((level) => level.points)).toEqual([10, 20, 30, 40]);
        });

        it.each([
            [levels([10, 20, 30]), 'exactly 4 levels'],
            [levels([10, 30, 20, 40]), 'points must grow'],
        ])('rejects an invalid scale with INVALID_ARGUMENT', async (scaleLevels, message) => {
            await expect(
                new CreateGradingScaleUseCase(repository).execute({ name: 'X', levels: scaleLevels }),
            ).rejects.toEqual(rpcError(status.INVALID_ARGUMENT, message));
        });
    });

    describe('update and delete', () => {
        const update = () => new UpdateGradingScaleUseCase(repository, criterionRepository);
        const remove = () => new DeleteGradingScaleUseCase(repository, criterionRepository);

        beforeEach(() => {
            repository.scales.set(50, customScale(50, [1, 2, 3, 4]));
        });

        it('never edits or deletes a system scale', async () => {
            await expect(update().execute(1, { name: 'X', levels: levels([1, 2, 3, 4]) })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, '"Proyectos finales" is a system grading scale and cannot be edited'),
            );
            await expect(remove().execute(2)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'cannot be deleted'),
            );
        });

        it('edits a scale whose events have no evaluations, under their exclusive rubric lock', async () => {
            repository.eventScales.set(7, 50);
            repository.eventScales.set(8, 50);

            const updated = await update().execute(50, { name: 'Nueva', levels: levels([5, 6, 7, 8]) });

            expect(updated.levels.map((level) => level.points)).toEqual([5, 6, 7, 8]);
            expect(withRubricLock).toHaveBeenCalledWith([7, 8], 'exclusive', expect.any(Function));
        });

        it('explains why a scale used by an evaluated event cannot be edited or deleted', async () => {
            repository.eventScales.set(7, 50);
            repository.evaluatedEvents.add(7);

            await expect(update().execute(50, { name: 'X', levels: levels([5, 6, 7, 8]) })).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'cannot be edited because event(s) 7 already have evaluations graded with it. Create a new scale instead.'),
            );
            await expect(remove().execute(50)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'cannot be deleted because event(s) 7 already have evaluations'),
            );
            expect(repository.scales.get(50)?.levels[0].points).toBe(1);
        });

        it('does not delete a scale still assigned to an event', async () => {
            repository.eventScales.set(7, 50);

            await expect(remove().execute(50)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'is assigned to event(s) 7. Assign them another scale before deleting it.'),
            );
        });

        it('deletes an unused catalog scale', async () => {
            await remove().execute(50);

            expect(repository.scales.has(50)).toBe(false);
        });
    });

    describe('assign to an event', () => {
        it('assigns a catalog scale by id', async () => {
            const { scale } = await assign().execute({ eventId: 7, scaleId: 3 });

            expect(scale.name).toBe('Cero a cien');
            expect(repository.eventScales.get(7)).toBe(3);
            expect(withRubricLock).toHaveBeenCalledWith([7], 'exclusive', expect.any(Function));
        });

        it('assigns a scale created in the catalog', async () => {
            const created = await repository.create({ name: 'Decenas', levels: levels([10, 20, 30, 40]) }, 3);

            const { scale } = await assign().execute({ eventId: 7, scaleId: created.id });

            expect(scale.name).toBe('Decenas');
            expect(repository.eventScales.get(7)).toBe(created.id);
        });

        it('assigns "Proyectos finales" when no scale is given', async () => {
            const { scale } = await assign().execute({ eventId: 7 });

            expect(scale.name).toBe('Proyectos finales');
        });

        it('assigns the system scale of the deprecated evaluation type when no scale is given', async () => {
            getEvent.mockResolvedValue({ id: 7, evaluationType: EvaluationType.ZERO_TO_FIVE });

            const { scale } = await assign().execute({ eventId: 7 });

            expect(scale.code).toBe('ZERO_TO_FIVE');
        });

        it('returns NOT_FOUND for an unknown scale id', async () => {
            await expect(assign().execute({ eventId: 7, scaleId: 999 })).rejects.toEqual(
                rpcError(status.NOT_FOUND, 'Grading scale 999 not found'),
            );
        });

        it('does not change the scale of an event that has evaluations', async () => {
            repository.eventScales.set(7, 1);
            repository.evaluatedEvents.add(7);

            await expect(assign().execute({ eventId: 7, scaleId: 3 })).rejects.toEqual(
                rpcError(
                    status.FAILED_PRECONDITION,
                    'The grading scale of event 7 cannot change because the event already has evaluations graded with "Proyectos finales".',
                ),
            );
            expect(repository.eventScales.get(7)).toBe(1);
        });

        it('accepts the same scale again for an event that has evaluations', async () => {
            repository.eventScales.set(7, 1);
            repository.evaluatedEvents.add(7);

            const { scale, locked } = await assign().execute({ eventId: 7, scaleId: 1 });

            expect(scale.id).toBe(1);
            expect(locked).toBe(true);
        });
    });

    describe('scale of an event', () => {
        it('returns the assigned scale without asking event-service', async () => {
            repository.eventScales.set(7, 2);

            const { scale } = await new GetEventGradingScaleUseCase(repository, buildResolver(repository, getEvent)).execute(7);

            expect(scale.name).toBe('Cero a cinco');
            expect(getEvent).not.toHaveBeenCalled();
        });

        it('gives an event without a scale the system scale of its evaluation type and saves it', async () => {
            getEvent.mockResolvedValue({ id: 7, evaluationType: EvaluationType.ZERO_TO_HUNDRED });

            const { scale } = await new GetEventGradingScaleUseCase(repository, buildResolver(repository, getEvent)).execute(7);

            expect(scale.code).toBe('ZERO_TO_HUNDRED');
            expect(repository.eventScales.get(7)).toBe(3);
        });

        it('returns NOT_FOUND when the event does not exist', async () => {
            getEvent.mockResolvedValue(null);

            await expect(
                new GetEventGradingScaleUseCase(repository, buildResolver(repository, getEvent)).execute(7),
            ).rejects.toEqual(rpcError(status.NOT_FOUND, 'Event 7 not found'));
        });
    });

    describe('backfill', () => {
        it('gives every existing event the system scale of its evaluation type and keeps existing assignments', async () => {
            repository.eventScales.set(3, 1);
            const pages = [
                {
                    totalPages: 2,
                    events: [
                        { id: 1, evaluationType: EvaluationType.ZERO_TO_FIVE },
                        { id: 2, evaluationType: EvaluationType.ZERO_TO_HUNDRED },
                    ],
                },
                {
                    totalPages: 2,
                    events: [
                        { id: 3, evaluationType: EvaluationType.ZERO_TO_FIVE },
                        { id: 4, evaluationType: EvaluationType.FINAL_PROJECTS },
                        { id: 5, evaluationType: EvaluationType.EVALUATION_TYPE_UNSPECIFIED },
                    ],
                },
            ];
            const backfill = new GradingScaleBackfillService(repository, eventDirectory(getEvent, pages));

            await expect(backfill.run()).resolves.toBe(4);

            expect(Object.fromEntries(repository.eventScales)).toEqual({ 1: 2, 2: 3, 3: 1, 4: 1, 5: 1 });
            await expect(backfill.run()).resolves.toBe(0);
        });
    });
});
