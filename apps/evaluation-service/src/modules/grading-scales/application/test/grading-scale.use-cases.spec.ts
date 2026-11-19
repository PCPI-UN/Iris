import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { AssignEventGradingScaleUseCase } from '../use-cases/assign-event-grading-scale.use-case';
import { CreateGradingScaleUseCase } from '../use-cases/create-grading-scale.use-case';
import { DeleteGradingScaleUseCase } from '../use-cases/delete-grading-scale.use-case';
import { GetEventGradingScaleUseCase } from '../use-cases/get-event-grading-scale.use-case';
import { GetGradingScaleUseCase } from '../use-cases/get-grading-scale.use-case';
import { ListGradingScalesUseCase } from '../use-cases/list-grading-scales.use-case';
import { UpdateGradingScaleUseCase } from '../use-cases/update-grading-scale.use-case';
import { UnassignEventGradingScaleUseCase } from '../use-cases/unassign-event-grading-scale.use-case';
import {
    buildResolver,
    customScale,
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
    const withRubricLock = jest.fn((_eventIds: number[], _mode: string, work: () => Promise<unknown>) => work());
    const criterionRepository = { withRubricLock } as unknown as CriterionRepositoryPort;

    beforeEach(() => {
        jest.clearAllMocks();
        repository = new InMemoryGradingScaleRepository();
    });

    const assign = () => new AssignEventGradingScaleUseCase(repository, criterionRepository, buildResolver(repository));

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
                rpcError(status.NOT_FOUND, 'No se encontró la escala de calificación 999'),
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
            [levels([10, 20, 30]), 'exactamente 4 niveles'],
            [levels([10, 30, 20, 40]), 'los puntos deben crecer'],
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
                rpcError(status.FAILED_PRECONDITION, '"Proyectos finales" es una escala del sistema y no se puede editar'),
            );
            await expect(remove().execute(2)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'no se puede borrar'),
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
                rpcError(status.FAILED_PRECONDITION, 'no se puede editar porque los eventos 7 ya tienen evaluaciones calificadas con ella. Crea una escala nueva.'),
            );
            await expect(remove().execute(50)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'no se puede borrar porque los eventos 7 ya tienen evaluaciones'),
            );
            expect(repository.scales.get(50)?.levels[0].points).toBe(1);
        });

        it('does not delete a scale still assigned to an event', async () => {
            repository.eventScales.set(7, 50);

            await expect(remove().execute(50)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'está asignada a los eventos 7. Asígnales otra escala antes de borrarla.'),
            );
        });

        it('deletes an unused catalog scale', async () => {
            await remove().execute(50);

            expect(repository.scales.has(50)).toBe(false);
        });
    });

    describe('unassign from an event', () => {
        const unassign = () => new UnassignEventGradingScaleUseCase(repository, criterionRepository);

        it('removes the assignment so the scale can be deleted', async () => {
            const created = await repository.create({ name: 'Decenas', levels: levels([10, 20, 30, 40]) }, 3);
            repository.eventScales.set(7, created.id);

            await expect(unassign().execute(7)).resolves.toBe(true);

            expect(repository.eventScales.has(7)).toBe(false);
            expect(withRubricLock).toHaveBeenCalledWith([7], 'exclusive', expect.any(Function));
            await new DeleteGradingScaleUseCase(repository, criterionRepository).execute(created.id);
            expect(repository.scales.has(created.id)).toBe(false);
        });

        it('succeeds when the event has no assignment', async () => {
            await expect(unassign().execute(7)).resolves.toBe(false);
        });

        it('keeps the scale of an event that has evaluations', async () => {
            repository.eventScales.set(7, 1);
            repository.evaluatedEvents.add(7);

            await expect(unassign().execute(7)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'ya tiene evaluaciones'),
            );
            expect(repository.eventScales.get(7)).toBe(1);
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

        it('returns NOT_FOUND for an unknown scale id', async () => {
            await expect(assign().execute({ eventId: 7, scaleId: 999 })).rejects.toEqual(
                rpcError(status.NOT_FOUND, 'No se encontró la escala de calificación 999'),
            );
        });

        it('does not change the scale of an event that has evaluations', async () => {
            repository.eventScales.set(7, 1);
            repository.evaluatedEvents.add(7);

            await expect(assign().execute({ eventId: 7, scaleId: 3 })).rejects.toEqual(
                rpcError(
                    status.FAILED_PRECONDITION,
                    'La escala de calificación del evento 7 no puede cambiar porque el evento ya tiene evaluaciones calificadas con "Proyectos finales".',
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
        const getEventScale = () => new GetEventGradingScaleUseCase(repository, buildResolver(repository));

        it('returns the assigned scale', async () => {
            repository.eventScales.set(7, 2);

            const { scale } = await getEventScale().execute(7);

            expect(scale.name).toBe('Cero a cinco');
        });

        it('fails explicitly for an event without a scale and assigns nothing', async () => {
            await expect(getEventScale().execute(7)).rejects.toEqual(
                rpcError(status.FAILED_PRECONDITION, 'El evento 7 no tiene una escala de calificación asignada'),
            );
            expect(repository.eventScales.has(7)).toBe(false);
        });
    });
});
