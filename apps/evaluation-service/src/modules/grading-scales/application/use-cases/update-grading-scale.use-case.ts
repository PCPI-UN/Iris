import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { GradingScale, GradingScaleInput } from '../../domain/grading-scale';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';
import {
    scaleNotFound,
    scaleUsedByEvaluatedEvents,
    systemScaleIsReadOnly,
    validScaleInput,
} from '../grading-scale.errors';

/**
 * Edits a catalog scale. System scales are read-only, and a scale that already graded evaluations
 * cannot change, because those grades were computed with its points.
 */
@Injectable()
export class UpdateGradingScaleUseCase {
    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly criterionRepository: CriterionRepositoryPort,
    ) {}

    async execute(id: number, input: GradingScaleInput | undefined): Promise<GradingScale> {
        const scale = await this.repository.findById(id);
        if (!scale) {
            throw scaleNotFound(id);
        }
        if (scale.isSystem) {
            throw systemScaleIsReadOnly(scale, 'editar');
        }
        const normalized = validScaleInput(input);

        // The rubric lock of every event using the scale keeps evaluations of those events
        // from reading the scale while it changes.
        const eventIds = await this.repository.findEventIdsByScale(id);
        return this.criterionRepository.withRubricLock(eventIds, 'exclusive', async () => {
            await assertSameEvents(this.repository, id, eventIds);

            const evaluated = await this.repository.findEventsWithEvaluations(eventIds);
            if (evaluated.length > 0) {
                throw scaleUsedByEvaluatedEvents(scale, evaluated, 'editar');
            }
            return this.repository.update(id, normalized);
        });
    }
}

/** Fails when the scale was assigned to another event after its events were locked. */
export async function assertSameEvents(
    repository: GradingScaleRepositoryPort,
    scaleId: number,
    lockedEventIds: number[],
): Promise<void> {
    const locked = new Set(lockedEventIds);
    const current = await repository.findEventIdsByScale(scaleId);
    if (current.some((eventId) => !locked.has(eventId))) {
        throw new RpcException({
            code: status.FAILED_PRECONDITION,
            message: 'La escala de calificación se asignó a otro evento mientras tanto. Inténtalo de nuevo.',
        });
    }
}
