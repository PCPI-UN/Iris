import {
  ComponentStatsProto,
  ScoreBucketProto,
} from '@app/common/generated/evaluation';
import { ProjectComplete } from '@app/common/generated/project';

/** Projects without a course section (NRC) are grouped under a null department */
export interface StatsDepartment {
  departmentId: number | null;
  departmentName: string | null;
}

export interface StatsBlock {
  /** Approved projects of the scope in the event */
  projectCount: number;
  /** Of them, the ones with at least one evaluation; only these enter the averages */
  evaluatedCount: number;
  /** Average of each rubric component and its criteria, with their effective weights (fractions, 0-1) */
  components: ComponentStatsProto[];
  /**
   * How many evaluated projects fall in each of 5 equal ranges from 0 to maxScore ([from, to),
   * the last one also includes `to`); null when the event has no grading scale
   */
  distribution: ScoreBucketProto[] | null;
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
