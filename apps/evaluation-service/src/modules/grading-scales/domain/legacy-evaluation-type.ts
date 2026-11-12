import { EvaluationType as EventEvaluationType } from '@app/common/generated/event';
import { DEFAULT_SCALE_CODE, SystemScaleCode } from './grading-scale';

/**
 * System scale that matches the deprecated `evaluationType` of an event. It accepts the numeric
 * value of event-service's enum and its name; anything else (unset, unspecified, unknown) maps to
 * the default scale, "Proyectos finales", which is also what event-service stores by default.
 */
export function systemScaleCodeFor(evaluationType: unknown): SystemScaleCode {
    switch (evaluationType) {
        case EventEvaluationType.ZERO_TO_FIVE:
        case 'ZERO_TO_FIVE':
            return SystemScaleCode.ZERO_TO_FIVE;
        case EventEvaluationType.ZERO_TO_HUNDRED:
        case 'ZERO_TO_HUNDRED':
            return SystemScaleCode.ZERO_TO_HUNDRED;
        default:
            return DEFAULT_SCALE_CODE;
    }
}
