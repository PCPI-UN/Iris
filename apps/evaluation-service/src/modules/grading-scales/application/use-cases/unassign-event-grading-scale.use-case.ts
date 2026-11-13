import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';

/**
 * Removes the grading scale assignment of an event, so a scale is not kept in use by an event
 * that no longer exists (the gateway calls it when it rolls back the creation of an event).
 * An event that has evaluations keeps its scale.
 */
@Injectable()
export class UnassignEventGradingScaleUseCase {
    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly criterionRepository: CriterionRepositoryPort,
    ) {}

    async execute(eventId: number): Promise<boolean> {
        if (!Number.isInteger(eventId) || eventId <= 0) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'eventId must be a positive integer' });
        }

        return this.criterionRepository.withRubricLock([eventId], 'exclusive', async () => {
            const evaluated = await this.repository.findEventsWithEvaluations([eventId]);
            if (evaluated.length > 0) {
                throw new RpcException({
                    code: status.FAILED_PRECONDITION,
                    message: `The grading scale of event ${eventId} cannot be removed because the event already has evaluations.`,
                });
            }
            return this.repository.unassignEvent(eventId);
        });
    }
}
