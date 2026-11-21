import { Injectable } from '@nestjs/common';
import { GradingScale } from '../../domain/grading-scale';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';

export interface GradingScaleView {
    scale: GradingScale;
    /** True when the scale can no longer be edited or deleted. */
    locked: boolean;
}

@Injectable()
export class ListGradingScalesUseCase {
    constructor(private readonly repository: GradingScaleRepositoryPort) {}

    async execute(): Promise<GradingScaleView[]> {
        const [scales, lockedIds] = await Promise.all([
            this.repository.findAll(),
            this.repository.findLockedScaleIds(),
        ]);
        return scales.map((scale) => ({ scale, locked: scale.isSystem || lockedIds.has(scale.id) }));
    }
}
