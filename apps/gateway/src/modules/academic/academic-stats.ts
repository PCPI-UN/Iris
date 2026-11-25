import { GetEventCriteriaStatsResponse } from '@app/common/generated/evaluation';
import { ProjectComplete } from '@app/common/generated/project';

/** Number of equal score ranges of the distribution, from 0 to maxScore */
export const DISTRIBUTION_BUCKETS = 5;

/** Projects without a course section (NRC) are grouped under a null department */
export interface StatsDepartment {
  departmentId: number | null;
  departmentName: string | null;
}

/** Projects whose final grade falls in [from, to); the last range also includes `to` */
export interface ScoreBucket {
  from: number;
  to: number;
  count: number;
}

export interface StatsBlock {
  /** Approved projects of the scope in the event */
  projectCount: number;
  /** Of them, the ones with at least one evaluation; only these enter the averages */
  evaluatedCount: number;
  /** Average of each rubric component and its criteria, with their effective weights (fractions, 0-1) */
  components: GetEventCriteriaStatsResponse['components'];
  /** How many evaluated projects fall in each score range; null when the event has no grading scale */
  distribution: ScoreBucket[] | null;
}

export interface DepartmentStats extends StatsDepartment, StatsBlock {}

export interface AcademicStats {
  eventId: number;
  eventName: string;
  resultsPublished: boolean;
  /** true when grades exist or may exist but the caller may not see them yet; then overall is null and departments [] */
  statsHidden: boolean;
  /** Points of the highest level of the event's grading scale; null when the event has none, and also while statsHidden */
  maxScore: number | null;
  overall: StatsBlock | null;
  /** Only with groupBy=department: one block per department, by name, the null department last */
  departments?: DepartmentStats[];
}

/** Final grade of each evaluated project, by project id */
export type FinalScores = Map<number, number>;

/**
 * DISTRIBUTION_BUCKETS ranges of equal width from 0 to maxScore with how many of the
 * scores fall in each. A score on a boundary goes to the upper range, except maxScore,
 * which stays in the last one. Without maxScore there is no range to build: null.
 */
export function scoreDistribution(
  scores: number[],
  maxScore: number | null,
): ScoreBucket[] | null {
  if (!maxScore || maxScore <= 0) return null;
  const width = maxScore / DISTRIBUTION_BUCKETS;
  const buckets: ScoreBucket[] = Array.from(
    { length: DISTRIBUTION_BUCKETS },
    (_, i) => ({
      from: round(i * width),
      to: round((i + 1) * width),
      count: 0,
    }),
  );
  for (const score of scores) {
    // the epsilon keeps 2.4 / 0.6 = 3.9999… in the range that starts at 2.4
    const index = Math.floor(score / width + 1e-9);
    buckets[Math.min(Math.max(index, 0), DISTRIBUTION_BUCKETS - 1)].count++;
  }
  return buckets;
}

/** Projects grouped by the department of their course section, by name, the ones without it last */
export function byDepartment(
  projects: ProjectComplete[],
): { department: StatsDepartment; projects: ProjectComplete[] }[] {
  const groups = new Map<
    number | null,
    { department: StatsDepartment; projects: ProjectComplete[] }
  >();
  for (const project of projects) {
    const course = project.academicCourse;
    const key = course?.departmentId ?? null;
    const group = groups.get(key) ?? {
      department: {
        departmentId: key,
        departmentName: course?.departmentName ?? null,
      },
      projects: [],
    };
    group.projects.push(project);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.department.departmentId === null) -
        Number(b.department.departmentId === null) ||
      (a.department.departmentName ?? '').localeCompare(
        b.department.departmentName ?? '',
        'es',
      ),
  );
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;
