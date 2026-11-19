import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EvaluationType } from '../../../common/constants/evaluation-type.constants';
import { EvaluationType as EventEvaluationType } from '@app/common/generated/event';

/**
 * Evaluation type of an event as sent by event-service (enum number or name). An event
 * without a type uses FINAL_PROJECTS.
 */
export function resolveEvaluationType(evaluationType: unknown): EvaluationType {
  if (
    evaluationType === undefined ||
    evaluationType === null ||
    evaluationType === EventEvaluationType.EVALUATION_TYPE_UNSPECIFIED ||
    evaluationType === EventEvaluationType.FINAL_PROJECTS ||
    evaluationType === EvaluationType.FINAL_PROJECTS
  ) {
    return EvaluationType.FINAL_PROJECTS;
  }

  if (
    evaluationType === EventEvaluationType.ZERO_TO_FIVE ||
    evaluationType === EvaluationType.ZERO_TO_FIVE
  ) {
    return EvaluationType.ZERO_TO_FIVE;
  }

  if (
    evaluationType === EventEvaluationType.ZERO_TO_HUNDRED ||
    evaluationType === EvaluationType.ZERO_TO_HUNDRED
  ) {
    return EvaluationType.ZERO_TO_HUNDRED;
  }

  throw new RpcException({
    code: status.INVALID_ARGUMENT,
    // El valor puede ser un nombre o un número
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    message: `Tipo de evaluación no soportado: ${String(evaluationType)}`,
  });
}
