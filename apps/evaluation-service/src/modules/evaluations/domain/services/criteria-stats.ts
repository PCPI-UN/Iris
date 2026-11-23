import { roundGrade } from '../../../../common/utils/grade.utils';

/** One score of an evaluation, with its criterion, its component and the effective weight it had. */
export interface StatsDetail {
  criterionId: number;
  criterionName: string;
  componentId: number | null;
  componentName: string | null;
  score: number;
  /** Effective weight stored when the project was evaluated (fraction of the grade) */
  weight: number;
}

/** One juror's evaluation of a project. */
export interface StatsEvaluation {
  details: StatsDetail[];
}

export interface CriterionStats {
  id: number;
  name: string;
  /** Effective weight of the criterion in the grade */
  weight: number;
  average: number;
}

export interface ComponentStats {
  id: number | null;
  name: string;
  /** Sum of the effective weights of its criteria */
  weight: number;
  average: number;
  /** Projects with at least one evaluation of this component */
  projectCount: number;
  /** Only when the criteria are requested */
  criteria?: CriterionStats[];
}

interface Average {
  total: number;
  count: number;
}

interface WeightedGroup {
  id: number | null;
  name: string;
  /** Effective weight of each criterion, by criterion id */
  weights: Map<number, number>;
  average: Average;
}

const addTo = (average: Average, value: number): void => {
  average.total += value;
  average.count += 1;
};

const mean = ({ total, count }: Average): number => total / count;

const sum = (values: Iterable<number>): number =>
  [...values].reduce((acc, value) => acc + value, 0);

/** Weighted average of the scores; a plain average when every weight is 0. */
function weightedScore(details: StatsDetail[]): number {
  const totalWeight = sum(details.map((d) => d.weight));
  if (totalWeight === 0) {
    return sum(details.map((d) => d.score)) / details.length;
  }
  return sum(details.map((d) => d.score * d.weight)) / totalWeight;
}

/** Score of each component in each juror's evaluation, averaged over the jurors of the project. */
function componentsOfProject(
  evaluations: StatsEvaluation[],
): Map<number | null, WeightedGroup> {
  const components = new Map<number | null, WeightedGroup>();
  for (const evaluation of evaluations) {
    const detailsByComponent = new Map<number | null, StatsDetail[]>();
    for (const detail of evaluation.details) {
      const details = detailsByComponent.get(detail.componentId) ?? [];
      details.push(detail);
      detailsByComponent.set(detail.componentId, details);
    }
    for (const [componentId, details] of detailsByComponent) {
      const component = components.get(componentId) ?? {
        id: componentId,
        name: details[0].componentName ?? '',
        weights: new Map(),
        average: { total: 0, count: 0 },
      };
      details.forEach((d) => component.weights.set(d.criterionId, d.weight));
      addTo(component.average, weightedScore(details));
      components.set(componentId, component);
    }
  }
  return components;
}

/** Score of each criterion averaged over the jurors of the project. */
function criteriaOfProject(
  evaluations: StatsEvaluation[],
): Map<number, { detail: StatsDetail; average: Average }> {
  const criteria = new Map<number, { detail: StatsDetail; average: Average }>();
  for (const evaluation of evaluations) {
    for (const detail of evaluation.details) {
      const criterion = criteria.get(detail.criterionId) ?? {
        detail,
        average: { total: 0, count: 0 },
      };
      addTo(criterion.average, detail.score);
      criteria.set(detail.criterionId, criterion);
    }
  }
  return criteria;
}

const byId = (a: { id: number | null }, b: { id: number | null }): number =>
  (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);

/**
 * Average score of each rubric component over a set of projects, using the effective
 * weights stored with each score. Inside a project, each juror's score of a component is
 * Σ(score·weight) / Σ(weight) of its criteria, and the project's score is the average of
 * its jurors. Across projects, each evaluated project counts the same, whatever its number
 * of jurors. Projects without evaluations are left out. Only the final values are rounded.
 *
 * @param projects - The evaluations of each project
 * @param withCriteria - Also return the average and weight of each criterion inside its component
 */
export function buildCriteriaStats(
  projects: StatsEvaluation[][],
  withCriteria: boolean,
): ComponentStats[] {
  const components = new Map<
    number | null,
    {
      name: string;
      weight: Average;
      average: Average;
      criteria: Map<
        number,
        { name: string; weight: Average; average: Average }
      >;
    }
  >();

  for (const evaluations of projects) {
    for (const group of componentsOfProject(evaluations).values()) {
      const component = components.get(group.id) ?? {
        name: group.name,
        weight: { total: 0, count: 0 },
        average: { total: 0, count: 0 },
        criteria: new Map(),
      };
      addTo(component.weight, sum(group.weights.values()));
      addTo(component.average, mean(group.average));
      components.set(group.id, component);
    }

    if (!withCriteria) continue;
    for (const { detail, average } of criteriaOfProject(evaluations).values()) {
      const criteria = components.get(detail.componentId)!.criteria;
      const criterion = criteria.get(detail.criterionId) ?? {
        name: detail.criterionName,
        weight: { total: 0, count: 0 },
        average: { total: 0, count: 0 },
      };
      addTo(criterion.weight, detail.weight);
      addTo(criterion.average, mean(average));
      criteria.set(detail.criterionId, criterion);
    }
  }

  return [...components.entries()]
    .map(([id, component]) => ({
      id,
      name: component.name,
      weight: mean(component.weight),
      average: roundGrade(mean(component.average)),
      projectCount: component.average.count,
      ...(withCriteria && {
        criteria: [...component.criteria.entries()]
          .map(([criterionId, criterion]) => ({
            id: criterionId,
            name: criterion.name,
            weight: mean(criterion.weight),
            average: roundGrade(mean(criterion.average)),
          }))
          .sort(byId),
      }),
    }))
    .sort(byId);
}
