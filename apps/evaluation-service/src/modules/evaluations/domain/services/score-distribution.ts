import { roundGrade } from '../../../../common/utils/grade.utils';
import { StatsEvaluation } from './criteria-stats';

/** Number of equal score ranges of the distribution, from 0 to the top of the grading scale */
export const DISTRIBUTION_BUCKETS = 5;

/** Projects whose final grade falls in [from, to); the last range also includes `to` */
export interface ScoreBucket {
  from: number;
  to: number;
  count: number;
}

/** Final grade of a project: the average of its jurors' grades, rounded as the averages of the event */
export function finalGrade(evaluations: StatsEvaluation[]): number {
  const total = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.grade,
    0,
  );
  return roundGrade(total / evaluations.length);
}

/**
 * DISTRIBUTION_BUCKETS ranges of equal width from 0 to maxScore with how many of the
 * grades fall in each. A grade on a boundary goes to the upper range, except maxScore,
 * which stays in the last one; grades out of 0..maxScore go to the first or last range.
 * Without maxScore there is no range to build: empty.
 */
export function scoreDistribution(
  grades: number[],
  maxScore: number | undefined,
): ScoreBucket[] {
  if (!maxScore || maxScore <= 0) return [];
  const width = maxScore / DISTRIBUTION_BUCKETS;
  const buckets: ScoreBucket[] = Array.from(
    { length: DISTRIBUTION_BUCKETS },
    (_, i) => ({
      from: round(i * width),
      to: round((i + 1) * width),
      count: 0,
    }),
  );
  for (const grade of grades) {
    // the epsilon keeps 2.4 / 0.6 = 3.9999… in the range that starts at 2.4
    const index = Math.floor(grade / width + 1e-9);
    buckets[Math.min(Math.max(index, 0), DISTRIBUTION_BUCKETS - 1)].count++;
  }
  return buckets;
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;
