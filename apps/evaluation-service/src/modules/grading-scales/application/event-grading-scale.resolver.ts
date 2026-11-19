import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { GradingScale } from '../domain/grading-scale';
import { GradingScaleRepositoryPort } from '../domain/grading-scale.repository.port';

/**
 * Finds the grading scale of an event. Every event gets one when it is created; the events created
 * before the scale catalog get theirs once per environment (see docs/evaluation-service). An event
 * without a scale is an error, never a silent default.
 */
@Injectable()
export class EventGradingScaleResolver {
    constructor(private readonly repository: GradingScaleRepositoryPort) {}

    async resolve(eventId: number): Promise<GradingScale> {
        const scale = await this.repository.findEventScale(eventId);
        if (!scale) {
            throw new RpcException({
                code: status.FAILED_PRECONDITION,
                message: `Event ${eventId} has no grading scale assigned`,
            });
        }
        return scale;
    }
}
