import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { GradingScale, GradingScaleInput } from '../domain/grading-scale';
import { normalizeGradingScaleInput, validateGradingScaleInput } from '../domain/grading-scale.rules';

export function scaleNotFound(id: number): RpcException {
    return new RpcException({ code: status.NOT_FOUND, message: `No se encontró la escala de calificación ${id}` });
}

/** Validates a scale and returns it normalized, or throws INVALID_ARGUMENT listing every problem. */
export function validScaleInput(input: GradingScaleInput | undefined | null): GradingScaleInput {
    const problems = validateGradingScaleInput(input);
    if (problems.length > 0) {
        throw new RpcException({
            code: status.INVALID_ARGUMENT,
            message: `Escala de calificación inválida: ${problems.join('; ')}`,
        });
    }
    return normalizeGradingScaleInput(input!);
}

export function systemScaleIsReadOnly(scale: GradingScale, action: 'editar' | 'borrar'): RpcException {
    return new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `"${scale.name}" es una escala del sistema y no se puede ${action}. Crea una escala nueva.`,
    });
}

export function scaleUsedByEvaluatedEvents(
    scale: GradingScale,
    eventIds: number[],
    action: 'editar' | 'borrar',
): RpcException {
    return new RpcException({
        code: status.FAILED_PRECONDITION,
        message:
            `La escala de calificación "${scale.name}" no se puede ${action} porque los eventos ${eventIds.join(', ')} ` +
            'ya tienen evaluaciones calificadas con ella. Crea una escala nueva.',
    });
}
