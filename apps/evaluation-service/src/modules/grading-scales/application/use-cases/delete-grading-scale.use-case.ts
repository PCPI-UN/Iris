import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';
import { scaleNotFound, scaleUsedByEvaluatedEvents, systemScaleIsReadOnly } from '../grading-scale.errors';
import { assertSameEvents } from './update-grading-scale.use-case';

/**
 * Deletes a catalog scale. Besides the rules of editing (not a system scale, no evaluations graded
 * with it), the scale must not be assigned to any event: an event always needs a scale.
 */
@Injectable()
export class DeleteGradingScaleUseCase {
    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly criterionRepository: CriterionRepositoryPort,
    ) {}

    async execute(id: number): Promise<void> {
        const scale = await this.repository.findById(id);
        if (!scale) {
            throw scaleNotFound(id);
        }
        if (scale.isSystem) {
            throw systemScaleIsReadOnly(scale, 'deleted');
        }

        const eventIds = await this.repository.findEventIdsByScale(id);
        await this.criterionRepository.withRubricLock(eventIds, 'exclusive', async () => {
            await assertSameEvents(this.repository, id, eventIds);

            const evaluated = await this.repository.findEventsWithEvaluations(eventIds);
            if (evaluated.length > 0) {
                throw scaleUsedByEvaluatedEvents(scale, evaluated, 'deleted');
            }
            if (eventIds.length > 0) {
                throw new RpcException({
                    code: status.FAILED_PRECONDITION,
                    message:
                        `Grading scale "${scale.name}" is assigned to event(s) ${eventIds.join(', ')}. ` +
                        'Assign them another scale before deleting it.',
                });
            }
            await this.repository.delete(id);
        });
    }
}
