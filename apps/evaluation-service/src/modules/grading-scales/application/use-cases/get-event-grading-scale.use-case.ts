import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';
import { EventGradingScaleResolver } from '../event-grading-scale.resolver';
import { isLocked } from './get-grading-scale.use-case';
import { GradingScaleView } from './list-grading-scales.use-case';

@Injectable()
export class GetEventGradingScaleUseCase {
    constructor(
        private readonly repository: GradingScaleRepositoryPort,
        private readonly resolver: EventGradingScaleResolver,
    ) {}

    async execute(eventId: number): Promise<GradingScaleView> {
        if (!Number.isInteger(eventId) || eventId <= 0) {
            throw new RpcException({ code: status.INVALID_ARGUMENT, message: 'eventId must be a positive integer' });
        }
        const scale = await this.resolver.resolve(eventId);
        return { scale, locked: await isLocked(this.repository, scale.id, scale.isSystem) };
    }
}
