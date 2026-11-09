import { isFullWeight, WEIGHT_SUM_TOLERANCE } from '../../../../common/utils/grade.utils';

/**
 * True when a component weight change pushes the components of an event over 100%.
 * Only raising a weight can do that: lowering one is always allowed, so an event left
 * over 100% (e.g. by the migration of an event with several rubrics) can be fixed.
 *
 * @param otherWeight sum of the other components of the event
 * @param requestedWeight new weight of the component
 * @param currentWeight current weight of the component (0 when it is being created)
 */
export function exceedsFullWeight(otherWeight: number, requestedWeight: number, currentWeight = 0): boolean {
  return requestedWeight > currentWeight && otherWeight + requestedWeight > 1 + WEIGHT_SUM_TOLERANCE;
}

export function exceedsFullWeightMessage(eventId: number, otherWeight: number, requestedWeight: number): string {
  return (
    `Total component weight for event ${eventId} would exceed 100%. ` +
    `Other components: ${(otherWeight * 100).toFixed(2)}%, Requested: ${(requestedWeight * 100).toFixed(2)}%`
  );
}

export interface RubricComponent {
  id: number;
  weight: number;
}

export interface RubricCriterion {
  id: number;
  weight: number;
  componentId: number | null;
}

export interface Rubric {
  /** True when the category can be evaluated. */
  ready: boolean;
  /** Sum of the component weights of the event (must be 1). */
  componentsWeight: number;
  /** Components of the event without any criterion in this category. */
  missingComponentIds: number[];
  /** Criteria of this category without component, or with a component of another event. */
  criteriaWithoutComponent: number[];
  /** Weight each criterion has in the grade (they add up to 1 when the rubric is ready). */
  effectiveWeights: Map<number, number>;
}

/**
 * Builds the rubric of one category (course) of an event.
 *
 * The event components carry a weight (fraction of 1) shared by every category.
 * Inside a component each criterion has a relative weight (1 by default), so
 *
 *   effectiveWeight = componentWeight × criterionWeight ÷ Σ criterionWeight (same component, same category)
 *
 * Example: Comunicación Oral 0.3 with relative weights 10 / 9 / 9 gives the
 * first criterion 0.3 × 10 ÷ 28 = 0.1071.
 */
export function buildRubric(components: RubricComponent[], criteria: RubricCriterion[]): Rubric {
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const componentsWeight = components.reduce((sum, component) => sum + component.weight, 0);

  const criteriaByComponent = new Map<number, RubricCriterion[]>();
  const criteriaWithoutComponent: number[] = [];

  for (const criterion of criteria) {
    if (criterion.componentId === null || !componentsById.has(criterion.componentId)) {
      criteriaWithoutComponent.push(criterion.id);
      continue;
    }
    const group = criteriaByComponent.get(criterion.componentId) ?? [];
    group.push(criterion);
    criteriaByComponent.set(criterion.componentId, group);
  }

  const missingComponentIds = components
    .filter((component) => !criteriaByComponent.has(component.id))
    .map((component) => component.id);

  const effectiveWeights = new Map<number, number>();
  for (const [componentId, group] of criteriaByComponent) {
    const component = componentsById.get(componentId)!;
    const relativeTotal = group.reduce((sum, criterion) => sum + criterion.weight, 0);
    for (const criterion of group) {
      effectiveWeights.set(
        criterion.id,
        relativeTotal > 0 ? (component.weight * criterion.weight) / relativeTotal : 0,
      );
    }
  }

  const ready =
    criteria.length > 0 &&
    isFullWeight(componentsWeight) &&
    missingComponentIds.length === 0 &&
    criteriaWithoutComponent.length === 0;

  return {
    ready,
    componentsWeight,
    missingComponentIds,
    criteriaWithoutComponent,
    effectiveWeights,
  };
}
