import { Injectable } from '@nestjs/common';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';
import { scaleNotFound } from '../grading-scale.errors';
import { GradingScaleView } from './list-grading-scales.use-case';

@Injectable()
export class GetGradingScaleUseCase {
    constructor(private readonly repository: GradingScaleRepositoryPort) {}

    async execute(id: number): Promise<GradingScaleView> {
        const scale = await this.repository.findById(id);
        if (!scale) {
            throw scaleNotFound(id);
        }
        return { scale, locked: await isLocked(this.repository, scale.id, scale.isSystem) };
    }
}

/** A scale is locked when it is a system scale or an event using it has evaluations. */
export async function isLocked(
    repository: GradingScaleRepositoryPort,
    scaleId: number,
    isSystem: boolean,
): Promise<boolean> {
    if (isSystem) {
        return true;
    }
    const eventIds = await repository.findEventIdsByScale(scaleId);
    return (await repository.findEventsWithEvaluations(eventIds)).length > 0;
}
