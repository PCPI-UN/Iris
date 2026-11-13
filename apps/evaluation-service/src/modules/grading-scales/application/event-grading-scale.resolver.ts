import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { GradingScale } from '../domain/grading-scale';
import { GradingScaleRepositoryPort } from '../domain/grading-scale.repository.port';
import { systemScaleCodeFor } from '../domain/legacy-evaluation-type';
import { EventDirectoryPort } from '../infrastructure/event-directory';

/**
 * Finds the grading scale of an event. Events created before the scale catalog may still have no
 * assignment (the startup backfill could not reach event-service, for example): they get the system
 * scale of their deprecated `evaluationType`, and that assignment is saved so it never changes.
 */
@Injectable()
export class EventGradingScaleResolver {
    private readonly logger = new Logger(EventGradingScaleResolver.name);

    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly events: EventDirectoryPort,
    ) {}

    /**
     * @param legacyEvaluationType the event's `evaluationType` when the caller already has the event;
     * when omitted and the event has no scale yet, the event is read from event-service.
     */
    async resolve(eventId: number, legacyEvaluationType?: unknown): Promise<GradingScale> {
        const assigned = await this.repository.findEventScale(eventId);
        if (assigned) {
            return assigned;
        }

        const fallback = await this.legacyScaleOf(eventId, legacyEvaluationType);
        await this.repository.assignIfMissing([{ eventId, scaleId: fallback.id }]);
        this.logger.log(`Event ${eventId} had no grading scale; assigned "${fallback.name}" from its evaluation type`);

        // Another call may have assigned a scale in between: the saved one wins
        return (await this.repository.findEventScale(eventId)) ?? fallback;
    }

    /** System scale of the event's deprecated evaluation type, without saving anything. */
    async legacyScaleOf(eventId: number, legacyEvaluationType?: unknown): Promise<GradingScale> {
        let evaluationType = legacyEvaluationType;
        if (evaluationType === undefined) {
            const event = await this.events.getEvent(eventId);
            if (!event) {
                throw new RpcException({ code: status.NOT_FOUND, message: `Event ${eventId} not found` });
            }
            evaluationType = event.evaluationType;
        }

        const code = systemScaleCodeFor(evaluationType);
        const scale = await this.repository.findByCode(code);
        if (!scale) {
            this.logger.error(`System grading scale ${code} is missing; check the grading scale migration`);
            throw new RpcException({ code: status.INTERNAL, message: 'The grading scale of the event could not be resolved' });
        }
        return scale;
    }
}
