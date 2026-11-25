import { GetProjectResultResponse } from '@app/common/generated/evaluation';

/**
 * Pieces of the result of a project (GetProjectResult of evaluation-service) as the
 * gateway shows them: the evaluation report and the academic project detail. Shared here
 * so gateway services do not import each other for it (see grpc-oneof.util).
 */

/** Separator evaluation-service uses to join the jurors' comments in one text */
const FEEDBACK_SEPARATOR = '\n\n';

export interface ResultCriterion {
  criterionId: number;
  criterion: string;
  /** Effective weight the criterion had in the grade (fraction, 0-1) */
  weight: number;
  /** Average of the jurors' scores for the criterion */
  score: number;
}

export interface ResultComponent {
  component: string;
  /** Sum of the effective weights of its criteria (fraction, 0-1) */
  weight: number;
  criteria: ResultCriterion[];
}

/** Rounds a weight to 4 decimals, enough to show 0.057 and still add up to 1 */
const roundWeight = (weight: number): number =>
  Math.round(weight * 10000) / 10000;

/** The jurors' comments one by one, from the text evaluation-service joins */
export function splitFeedback(feedback: string | undefined): string[] {
  return (feedback ?? '')
    .split(FEEDBACK_SEPARATOR)
    .map((comment) => comment.trim())
    .filter((comment) => comment.length > 0);
}

/**
 * Criteria grouped by component, in the order evaluation-service sends them (by
 * component, then criterion). The weight of a component is the sum of the effective
 * weights of its criteria, which is the share of the grade it had.
 */
export function groupByComponent(
  result: Pick<GetProjectResultResponse, 'criteria'>,
): ResultComponent[] {
  const components: ResultComponent[] = [];
  for (const criterion of result.criteria ?? []) {
    const name = criterion.component?.trim() || 'Sin componente';
    let component = components.find((c) => c.component === name);
    if (!component) {
      component = { component: name, weight: 0, criteria: [] };
      components.push(component);
    }
    component.weight += criterion.weight;
    component.criteria.push({
      criterionId: criterion.criterionId,
      criterion: criterion.criterion,
      weight: roundWeight(criterion.weight),
      score: criterion.score,
    });
  }
  return components.map((c) => ({ ...c, weight: roundWeight(c.weight) }));
}
