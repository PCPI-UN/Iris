import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { GradingScale, GradingScaleInput } from '../domain/grading-scale';
import { normalizeGradingScaleInput, validateGradingScaleInput } from '../domain/grading-scale.rules';

export function scaleNotFound(id: number): RpcException {
    return new RpcException({ code: status.NOT_FOUND, message: `Grading scale ${id} not found` });
}

/** Validates a scale and returns it normalized, or throws INVALID_ARGUMENT listing every problem. */
export function validScaleInput(input: GradingScaleInput | undefined | null): GradingScaleInput {
    const problems = validateGradingScaleInput(input);
    if (problems.length > 0) {
        throw new RpcException({
            code: status.INVALID_ARGUMENT,
            message: `Invalid grading scale: ${problems.join('; ')}`,
        });
    }
    return normalizeGradingScaleInput(input!);
}

export function systemScaleIsReadOnly(scale: GradingScale, action: 'edited' | 'deleted'): RpcException {
    return new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `"${scale.name}" is a system grading scale and cannot be ${action}. Create a new scale instead.`,
    });
}

export function scaleUsedByEvaluatedEvents(
    scale: GradingScale,
    eventIds: number[],
    action: 'edited' | 'deleted',
): RpcException {
    return new RpcException({
        code: status.FAILED_PRECONDITION,
        message:
            `Grading scale "${scale.name}" cannot be ${action} because event(s) ${eventIds.join(', ')} ` +
            'already have evaluations graded with it. Create a new scale instead.',
    });
}
