import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '../../../criterions/domain/repositories/criterion.repository.port';
import { GradingScale } from '../../domain/grading-scale';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';
import { EventGradingScaleResolver } from '../event-grading-scale.resolver';
import { scaleNotFound } from '../grading-scale.errors';
import { isLocked } from './get-grading-scale.use-case';
import { GradingScaleView } from './list-grading-scales.use-case';

export interface AssignEventGradingScaleCommand {
    eventId: number;
    /** A scale of the catalog; new scales are created with CreateGradingScale first. */
    scaleId?: number | null;
}

/**
 * Sets the grading scale of an event: a catalog scale or, without one, the system scale of the
 * event's deprecated evaluation type, "Proyectos finales" by default. Once the event has
 * evaluations its scale is fixed; assigning the same scale again is accepted and changes nothing.
 */
@Injectable()
export class AssignEventGradingScaleUseCase {
    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly criterionRepository: CriterionRepositoryPort,
        private readonly resolver: EventGradingScaleResolver,
    ) {}

    async execute(command: AssignEventGradingScaleCommand): Promise<GradingScaleView> {
        const { eventId } = command;
        if (!Number.isInteger(eventId) || eventId <= 0) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'eventId must be a positive integer' });
        }

        const hasScaleId = command.scaleId !== undefined && command.scaleId !== null;

        return this.criterionRepository.withRubricLock([eventId], 'exclusive', async () => {
            const target = hasScaleId
                ? await this.findScale(command.scaleId!)
                : await this.resolver.legacyScaleOf(eventId);

            const evaluated = await this.repository.findEventsWithEvaluations([eventId]);
            if (evaluated.length > 0) {
                const current =
                    (await this.repository.findEventScale(eventId)) ?? (await this.resolver.legacyScaleOf(eventId));
                if (target.id === current.id) {
                    await this.repository.assignIfMissing([{ eventId, scaleId: current.id }]);
                    return { scale: current, locked: true };
                }
                throw new RpcException({
                    code: status.FAILED_PRECONDITION,
                    message:
                        `The grading scale of event ${eventId} cannot change because the event already has ` +
                        `evaluations graded with "${current.name}".`,
                });
            }

            await this.repository.assignToEvent(eventId, target.id);
            return { scale: target, locked: await isLocked(this.repository, target.id, target.isSystem) };
        });
    }

    private async findScale(id: number): Promise<GradingScale> {
        const scale = await this.repository.findById(id);
        if (!scale) {
            throw scaleNotFound(id);
        }
        return scale;
    }
}
