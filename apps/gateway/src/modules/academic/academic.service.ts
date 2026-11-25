import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import {
  AcademicCourse,
  AcademicScope,
  ListProjectsResponse,
  ProjectComplete,
  ProjectState,
} from '@app/common/generated/project';
import {
  AcademicCourseWithTerm,
  termCode,
  withTermCodes,
} from '@app/common/utils/term-code.util';
import { withoutOneofMarkers } from '@app/common/utils/grpc-oneof.util';
import { pendingStatus } from '@app/common/utils/pending-status.util';
import {
  groupByComponent,
  splitFeedback,
} from '@app/common/utils/project-result.util';
import { GetProjectResultResponse } from '@app/common/generated/evaluation';
import { ProjectsService } from '../projects/projects.service';
import { EventService } from '../events/events.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { AppUser } from '../auth/types/app-user.type';
import { positionOf } from '../events/ranking/ranking-positions';
import {
  AcademicCourseSummary,
  AcademicEvent,
  AcademicProjectDetail,
  AcademicProjectEvaluation,
  AcademicProjectRanking,
  AcademicProjectResult,
  GradeRow,
  GradesReport,
  GradeStatus,
  ProjectReviewState,
  RegistrationProject,
  RegistrationStudent,
  RegistrationsReport,
} from './academic.types';
import { ListAcademicProjectsDto } from './dto/academic-query.dto';
import {
  AcademicProfile,
  academicProfilesOf,
  profileScope,
} from './academic-profiles';

const REVIEW_STATES: ProjectReviewState[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REQUEST_CHANGES',
];

/**
 * Read-only endpoints of the academic roles (CU-86e3vmz0m).
 *
 * Every read is done as one academic profile of the caller (`profile`, see
 * ACADEMIC_PROFILES): PROFESSOR, TUTOR, DIRECTOR or DEAN, each from its platform role. A
 * profile the caller lacks is a 403. project-service applies only the scope of that
 * profile (course sections, tutored, department or all), not the union of every scope of
 * the user: a professor who also tutors sees, as TUTOR, only the projects they tutor. A
 * project outside the scope is a 404, the same as a missing one; so is an event of
 * /registrations or /grades that is deleted or has no project of the scope (it is not in
 * /academic/events).
 *
 * Grades: a caller with `read:grades` (Admin, FacultyAdmin, Dean) sees them at any
 * time; anyone else only once the admin publishes the event results. The rule is
 * applied here, before the JSON or the Excel is built, so no format can show more. The
 * project detail follows it for the result and the ranking position; how many jurors
 * evaluated is shown to every caller of the scope.
 */
@Injectable()
export class AcademicService {
  private readonly logger = new Logger(AcademicService.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly eventsService: EventService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  /** Academic profiles of the caller; empty without an academic role (students, Admin, FacultyAdmin) */
  listProfiles(user: AppUser): AcademicProfile[] {
    return academicProfilesOf(user);
  }

  async listProjects(
    user: AppUser,
    query: ListAcademicProjectsDto,
  ): Promise<ListProjectsResponse> {
    const scope = profileScope(user, query.profile);
    const page = await this.projectsService.listProjectsInScope({
      userId: user.id,
      scope,
      eventId: query.eventId,
      state: query.state ? ProjectState[query.state] : undefined,
      academicCourseId: query.academicCourseId,
      q: query.q,
      currentPage: query.currentPage ?? 1,
      itemsPerPage: query.itemsPerPage ?? 10,
    });
    const codes = await this.termCodes();
    return withoutOneofMarkers({
      ...page,
      items: withTermCodes(page.items ?? [], codes),
    });
  }

  /**
   * One project of the caller's scope with its evaluation: juror counters always; the
   * result (grade, criteria by component, comments) and the ranking position only when
   * the caller may see the grade (same rule as getGrades).
   */
  async getProject(
    user: AppUser,
    projectId: number,
    profile: AcademicProfile,
  ): Promise<AcademicProjectDetail> {
    const project = await this.projectsService.getProjectInScope(
      user.id,
      projectId,
      profileScope(user, profile),
    );
    const [codes, event, averages] = await Promise.all([
      this.termCodes(),
      this.eventsService.getEventById(project.eventId),
      this.evaluationsService.getAverageGrades([projectId]),
    ]);
    const [withTerm] = withTermCodes([project], codes);

    const completedEvaluations = averages[0]?.evaluationCount ?? 0;
    const assignedJurors = project.assignedJurorCount ?? 0;
    const view = gradeView(
      completedEvaluations,
      !!event?.resultsPublished,
      canReadUnpublishedGrades(user),
    );

    const [result, ranking] = view.visible
      ? await Promise.all([
          this.evaluationsService.getProjectResult(projectId),
          this.ranking(project),
        ])
      : [undefined, null];

    const evaluation: AcademicProjectEvaluation = {
      gradeStatus: view.gradeStatus,
      assignedJurors,
      completedEvaluations,
      pendingEvaluations: Math.max(assignedJurors - completedEvaluations, 0),
      resultHidden: view.hidden,
      result: result ? toProjectResult(result) : null,
      ranking,
    };
    return withoutOneofMarkers({ ...withTerm, evaluation });
  }

  /**
   * Position of an approved project in its category, the same as the student results:
   * dense positions over the rounded averages of the approved projects of the category,
   * only for events with a ranking configuration. Any failure leaves the position out
   * instead of failing the whole detail.
   */
  private async ranking(
    project: ProjectComplete,
  ): Promise<AcademicProjectRanking | null> {
    if (reviewState(project.state) !== 'APPROVED') return null;
    const { id, eventId, courseId: categoryId } = project;
    try {
      const { rankingEvent } =
        await this.eventsService.getRankingEventByEventId(eventId);
      if (!rankingEvent) return null;

      const approved = await this.eventsService.listApprovedProjects(
        eventId,
        categoryId,
      );
      const averages = await this.evaluationsService.getAverageGrades(
        approved.map((p) => p.id),
      );
      const own = positionOf(averages, id);
      if (!own) return null;

      const { category } = await this.eventsService.getCategory(categoryId);
      return {
        ...own,
        categoryId,
        categoryName: category?.name?.trim() || 'Sin categoria',
      };
    } catch (error: unknown) {
      // An event without ranking configuration has no positions
      if ((error as { code?: number } | null)?.code === status.NOT_FOUND) {
        return null;
      }
      this.logger.warn(
        `Ranking of project ${id} in event ${eventId} unavailable: ${(error as Error)?.message}`,
      );
      return null;
    }
  }

  /** Events where the projects of the caller's scope take part, newest first; deleted ones are left out */
  async listEvents(
    user: AppUser,
    profile: AcademicProfile,
  ): Promise<AcademicEvent[]> {
    const ids = await this.projectsService.listEventIdsInScope(
      user.id,
      profileScope(user, profile),
    );
    // ListEventsByIds returns them newest first, soft deleted ones (active = false) included
    const events = await this.eventsService.listEventsByIds(ids);
    return events
      .filter((event) => event.active)
      .map((event) => ({
        id: event.id,
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        inscriptionDeadline: event.inscriptionDeadline,
        active: event.active,
        evaluationsOpened: event.evaluationsOpened,
        resultsPublished: event.resultsPublished,
        requiresCourse: event.requiresCourse,
      }));
  }

  /** Projects of the caller's scope in the event, with their review state and students */
  async getRegistrations(
    user: AppUser,
    eventId: number,
    profile: AcademicProfile,
  ): Promise<RegistrationsReport> {
    const scope = profileScope(user, profile);
    const event = await this.requireEventInScope(user.id, scope, eventId);
    const projects = withTermCodes(
      await this.projectsService.listAllProjectsInScope({
        userId: user.id,
        eventId,
        scope,
      }),
      await this.termCodes(),
    );

    const rows = projects.map(toRegistrationProject);
    const byState = Object.fromEntries(
      REVIEW_STATES.map((state) => [state, 0]),
    ) as Record<ProjectReviewState, number>;
    rows.forEach((row) => byState[row.state]++);
    const students = rows.flatMap((row) => row.students);

    return {
      eventId,
      eventName: event.name,
      totals: {
        projects: rows.length,
        byState,
        confirmedStudents: students.filter((s) => s.status === 'CONFIRMED')
          .length,
        pendingStudents: students.filter((s) => s.status !== 'CONFIRMED')
          .length,
      },
      projects: rows,
    };
  }

  /**
   * Grades of the approved projects of the caller's scope in the event. Every project
   * shows its status and how many of its jurors have evaluated; the grade only when the
   * caller may see it.
   */
  async getGrades(
    user: AppUser,
    eventId: number,
    profile: AcademicProfile,
  ): Promise<GradesReport> {
    const scope = profileScope(user, profile);
    const event = await this.requireEventInScope(user.id, scope, eventId);
    const projects = withTermCodes(
      await this.projectsService.listAllProjectsInScope({
        userId: user.id,
        eventId,
        state: ProjectState.APPROVED,
        scope,
      }),
      await this.termCodes(),
    );
    const averages = await this.evaluationsService.getAverageGrades(
      projects.map((p) => p.id),
    );
    const averageById = new Map(averages.map((a) => [a.projectId, a]));

    const resultsPublished = !!event.resultsPublished;
    const seesUnpublished = canReadUnpublishedGrades(user);

    const rows: GradeRow[] = projects.map((project) => {
      const average = averageById.get(project.id);
      const completedEvaluations = average?.evaluationCount ?? 0;
      const assignedJurors = project.assignedJurorCount ?? 0;
      const { gradeStatus, visible, hidden } = gradeView(
        completedEvaluations,
        resultsPublished,
        seesUnpublished,
      );

      return {
        projectId: project.id,
        projectCode: project.projectCode || null,
        projectName: project.name,
        participantNames: studentNames(project),
        academicCourse: toCourseSummary(project.academicCourse),
        gradeStatus,
        assignedJurors,
        completedEvaluations,
        pendingEvaluations: Math.max(assignedJurors - completedEvaluations, 0),
        finalScore: visible ? (average?.averageGrade ?? null) : null,
        gradeHidden: hidden,
      };
    });

    return {
      eventId,
      eventName: event.name,
      resultsPublished,
      gradeVisibility: seesUnpublished ? 'ALL' : 'PUBLISHED_ONLY',
      generatedAt: new Date(),
      projects: rows.sort(byCourseThenName),
    };
  }

  /** Term code (year + period, such as 202610) by term id */
  private async termCodes(): Promise<Map<number, string>> {
    const terms = await this.eventsService.listTerms();
    return new Map(terms.map((term) => [term.id, termCode(term)]));
  }

  /**
   * The event, if it is one of /academic/events of the profile: not deleted and with at
   * least one project of its scope. Otherwise a 404, the same as a missing event, as
   * /academic/projects/:id does with a project outside the scope.
   */
  private async requireEventInScope(
    userId: number,
    scope: AcademicScope,
    eventId: number,
  ) {
    const inScope = await this.projectsService.listEventIdsInScope(
      userId,
      scope,
    );
    const event = inScope.includes(eventId)
      ? await this.eventsService.getEventById(eventId)
      : undefined;
    if (!event?.active) throw new NotFoundException(`No se encontró el evento con ID ${eventId}`);
    return event;
  }
}

/** Admin (passes every check) or a role with read:grades sees grades before publication */
export function canReadUnpublishedGrades(user: AppUser): boolean {
  return (
    user.platformRoles?.some((role) => role.name === 'Admin') ||
    (user.platformPermissions ?? []).includes('read:grades')
  );
}

export function toGradeStatus(
  completedEvaluations: number,
  resultsPublished: boolean,
): GradeStatus {
  if (completedEvaluations === 0) return 'PENDING';
  return resultsPublished ? 'OFFICIAL' : 'PRELIMINARY';
}

/**
 * Grade rule of the academic views: a grade exists once a juror evaluated; it is shown
 * once the results are published, or before to a caller that reads unpublished grades.
 * hidden: it exists but the caller may not see it yet.
 */
export function gradeView(
  completedEvaluations: number,
  resultsPublished: boolean,
  seesUnpublished: boolean,
): { gradeStatus: GradeStatus; visible: boolean; hidden: boolean } {
  const gradeStatus = toGradeStatus(completedEvaluations, resultsPublished);
  const exists = gradeStatus !== 'PENDING';
  const visible = exists && (resultsPublished || seesUnpublished);
  return { gradeStatus, visible, hidden: exists && !visible };
}

/** Result of evaluation-service as the detail shows it; null when nobody evaluated */
export function toProjectResult(
  result: GetProjectResultResponse,
): AcademicProjectResult | null {
  if (!result.evaluated) return null;
  return {
    finalScore: result.finalScore,
    maxScore: result.maxScore,
    components: groupByComponent(result),
    comments: splitFeedback(result.consolidatedFeedback),
  };
}

/** The proto enums arrive as their names (gRPC loader enums: String) or as numbers */
export function reviewState(state: unknown): ProjectReviewState {
  const name = typeof state === 'number' ? ProjectState[state] : String(state);
  return (REVIEW_STATES as string[]).includes(name)
    ? (name as ProjectReviewState)
    : 'UNDER_REVIEW';
}

const informative = (value?: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed && trimmed !== 'N/A' ? trimmed : null;
};

function toCourseSummary(
  course: AcademicCourse | undefined,
): AcademicCourseSummary | null {
  if (!course) return null;
  return {
    id: course.id,
    nrc: course.nrc,
    termId: course.termId,
    term: (course as AcademicCourseWithTerm).term ?? null,
    name: course.name,
    departmentName: course.departmentName,
  };
}

/**
 * Students of a project: the confirmed ones (with the semester and career captured at
 * submission, matched by student code) and the pending ones that have not joined yet.
 */
export function toRegistrationProject(
  project: ProjectComplete,
): RegistrationProject {
  const pendings = project.pendingParticipants ?? [];
  const submittedByCode = new Map(pendings.map((p) => [p.studentCode, p]));

  const confirmed: RegistrationStudent[] = (project.participants ?? []).map(
    (participant) => {
      const submitted = submittedByCode.get(participant.studentCode);
      return {
        status: 'CONFIRMED',
        userId: participant.userId,
        firstName: participant.firstName ?? submitted?.firstName ?? null,
        lastName: participant.lastName ?? submitted?.lastName ?? null,
        email: participant.email ?? submitted?.email ?? null,
        studentCode: participant.studentCode,
        semester: informative(submitted?.semester),
        career: informative(submitted?.career),
      };
    },
  );
  const confirmedCodes = new Set(confirmed.map((s) => s.studentCode));

  const pending: RegistrationStudent[] = pendings
    .filter(
      (p) =>
        pendingStatus(p.status) !== 'JOINED' &&
        !confirmedCodes.has(p.studentCode),
    )
    .map((p) => ({
      status: pendingStatus(p.status) === 'INVITED' ? 'INVITED' : 'PENDING',
      userId: null,
      firstName: p.firstName || null,
      lastName: p.lastName || null,
      email: p.email || null,
      studentCode: p.studentCode,
      semester: informative(p.semester),
      career: informative(p.career),
    }));

  return {
    projectId: project.id,
    projectCode: project.projectCode || null,
    projectName: project.name,
    state: reviewState(project.state),
    reason: project.reason || null,
    academicCourse: toCourseSummary(project.academicCourse),
    tutors: (project.tutors ?? []).map((tutor) =>
      [tutor.firstName, tutor.lastName].filter(Boolean).join(' '),
    ),
    students: [...confirmed, ...pending],
  };
}

/**
 * Names of the students of a project, each once: a confirmed student also stays in the
 * pending list as JOINED, so the generic event helper would repeat them.
 */
export function studentNames(project: ProjectComplete): string[] {
  return toRegistrationProject(project)
    .students.map(
      (student) =>
        [student.firstName, student.lastName].filter(Boolean).join(' ') ||
        student.email ||
        student.studentCode,
    )
    .filter((name) => name.length > 0);
}

/**
 * By course section (term code, then NRC as a number: 9876 before 10234), projects without
 * one last; then by name
 */
export function byCourseThenName(a: GradeRow, b: GradeRow): number {
  const courseA = a.academicCourse;
  const courseB = b.academicCourse;
  if (!courseA || !courseB) {
    if (courseA !== courseB) return courseA ? -1 : 1;
  } else {
    const byCourse =
      (courseA.term ?? '').localeCompare(courseB.term ?? '') ||
      courseA.nrc.localeCompare(courseB.nrc, 'es', { numeric: true });
    if (byCourse !== 0) return byCourse;
  }
  return a.projectName.localeCompare(b.projectName, 'es');
}
