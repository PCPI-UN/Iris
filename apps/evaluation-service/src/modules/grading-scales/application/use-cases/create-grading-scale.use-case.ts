import { Injectable } from '@nestjs/common';
import { GradingScale, GradingScaleInput } from '../../domain/grading-scale';
import { GradingScaleRepositoryPort } from '../../domain/grading-scale.repository.port';
import { validScaleInput } from '../grading-scale.errors';

@Injectable()
export class CreateGradingScaleUseCase {
    constructor(private readonly repository: GradingScaleRepositoryPort) {}

    async execute(input: GradingScaleInput | undefined, userId?: number | null): Promise<GradingScale> {
        return this.repository.create(validScaleInput(input), userId ?? null);
    }
}
