import { TermProto } from '@app/common/generated/event';
import { AcademicCourse, ProjectComplete } from '@app/common/generated/project';

/** Term code as the university writes it: 2026 + "10" is 202610 */
export function termCode(term: Pick<TermProto, 'year' | 'period'>): string {
  return `${term.year}${term.period}`;
}

/** Course section of a project with the code of its term */
export type AcademicCourseWithTerm = AcademicCourse & { term?: string | null };

/**
 * Adds the term code to the course section of each project: project-service only knows
 * the term id, and the terms live in event-service.
 */
export function withTermCodes<T extends ProjectComplete>(
  projects: T[],
  codes: Map<number, string>,
): T[] {
  return projects.map((project) =>
    project.academicCourse
      ? {
          ...project,
          academicCourse: {
            ...project.academicCourse,
            term: codes.get(project.academicCourse.termId) ?? null,
          } as AcademicCourseWithTerm,
        }
      : project,
  );
}
