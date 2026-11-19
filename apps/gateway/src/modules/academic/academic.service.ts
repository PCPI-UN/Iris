import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AcademicCourse,
  ListProjectsResponse,
  ProjectComplete,
  ProjectState,
} from '@app/common/generated/project';
import { TermProto } from '@app/common/generated/event';
import { ProjectsService } from '../projects/projects.service';
import { EventService } from '../events/events.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { AppUser } from '../auth/types/app-user.type';
import {
  AcademicCourseSummary,
  AcademicEvent,
  GradeRow,
  GradesReport,
  GradeStatus,
  ProjectReviewState,
  RegistrationProject,
  RegistrationStudent,
  RegistrationsReport,
} from './academic.types';
import { ListAcademicProjectsDto } from './dto/academic-query.dto';

const REVIEW_STATES: ProjectReviewState[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'REQUEST_CHANGES',
];

/**
 * Read-only endpoints of the academic roles (CU-86e3vmz0m).
 *
 * Which projects a caller sees is decided by project-service from their scope
 * permissions: read_all (Admin, FacultyAdmin, Dean) sees every project; read_tutored
 * (Tutor), read_course (Professor) and read_department (DepartmentDirector) only the
 * ones they tutor, teach (course section) or direct (department). A project outside the
 * scope is a 404, the same as a missing one; so is an event of /registrations or /grades
 * that is deleted or has no project of the caller's scope (it is not in /academic/events).
 *
 * Grades: a caller with `read:grades` (Admin, FacultyAdmin, Dean) sees them at any
 * time; anyone else only once the admin publishes the event results. The rule is
 * applied here, before the JSON or the Excel is built, so no format can show more.
 */
@Injectable()
export class AcademicService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly eventsService: EventService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  async listProjects(
    userId: number,
    query: ListAcademicProjectsDto,
  ): Promise<ListProjectsResponse> {
    const page = await this.projectsService.listProjectsInScope({
      userId,
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

  async getProject(
    userId: number,
    projectId: number,
  ): Promise<ProjectComplete> {
    const project = await this.projectsService.getProjectInScope(
      userId,
      projectId,
    );
    const [withTerm] = withTermCodes([project], await this.termCodes());
    return withoutOneofMarkers(withTerm);
  }

  /** Events where the projects of the caller's scope take part, newest first; deleted ones are left out */
  async listEvents(userId: number): Promise<AcademicEvent[]> {
    const ids = await this.projectsService.listEventIdsInScope(userId);
    // ListEventsByIds also returns soft deleted events (active = false), on purpose
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
      }))
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  }

  /** Projects of the caller's scope in the event, with their review state and students */
  async getRegistrations(
    userId: number,
    eventId: number,
  ): Promise<RegistrationsReport> {
    const event = await this.requireEventInScope(userId, eventId);
    const projects = withTermCodes(
      await this.projectsService.listAllProjectsInScope({ userId, eventId }),
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
  async getGrades(user: AppUser, eventId: number): Promise<GradesReport> {
    const event = await this.requireEventInScope(user.id, eventId);
    const projects = withTermCodes(
      await this.projectsService.listAllProjectsInScope({
        userId: user.id,
        eventId,
        state: ProjectState.APPROVED,
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
      const gradeStatus = toGradeStatus(completedEvaluations, resultsPublished);
      const visible =
        gradeStatus !== 'PENDING' && (resultsPublished || seesUnpublished);

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
        gradeHidden: gradeStatus !== 'PENDING' && !visible,
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
   * The event, if it is one of /academic/events: not deleted and with at least one project
   * of the caller's scope. Otherwise a 404, the same as a missing event, as
   * /academic/projects/:id does with a project outside the scope.
   */
  private async requireEventInScope(userId: number, eventId: number) {
    const inScope = await this.projectsService.listEventIdsInScope(userId);
    const event = inScope.includes(eventId)
      ? await this.eventsService.getEventById(eventId)
      : undefined;
    if (!event?.active) throw new NotFoundException(`No se encontró el evento con ID ${eventId}`);
    return event;
  }
}

/** Term code as the university writes it: 2026 + "10" is 202610 */
export function termCode(term: Pick<TermProto, 'year' | 'period'>): string {
  return `${term.year}${term.period}`;
}

/** Course section of a project with the code of its term */
type AcademicCourseWithTerm = AcademicCourse & { term?: string | null };

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

/**
 * Removes the "_field": "field" markers the gRPC loader (oneofs: true) adds for every
 * proto3 optional field that is set; they carry no data.
 */
export function withoutOneofMarkers<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutOneofMarkers) as T;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, field]) => !(key.startsWith('_') && field === key.slice(1)))
        .map(([key, field]) => [key, withoutOneofMarkers(field)]),
    ) as T;
  }
  return value;
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

/** The proto enums arrive as their names (gRPC loader enums: String) or as numbers */
export function reviewState(state: unknown): ProjectReviewState {
  const name = typeof state === 'number' ? ProjectState[state] : String(state);
  return (REVIEW_STATES as string[]).includes(name)
    ? (name as ProjectReviewState)
    : 'UNDER_REVIEW';
}

/** Pending participant status: PENDING, INVITED or JOINED, by name or as 1, 2, 3 */
function pendingStatus(status: unknown): 'PENDING' | 'INVITED' | 'JOINED' {
  const value = String(status);
  if (value === 'JOINED' || value === '3') return 'JOINED';
  if (value === 'INVITED' || value === '2') return 'INVITED';
  return 'PENDING';
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

/** By course section (term, then NRC), projects without one last; then by name */
export function byCourseThenName(a: GradeRow, b: GradeRow): number {
  const courseKey = (row: GradeRow) =>
    row.academicCourse ? `${row.academicCourse.term ?? ''} ${row.academicCourse.nrc}` : null;
  const courseA = courseKey(a);
  const courseB = courseKey(b);
  if (courseA !== courseB) {
    if (courseA === null) return 1;
    if (courseB === null) return -1;
    return courseA < courseB ? -1 : 1;
  }
  return a.projectName.localeCompare(b.projectName, 'es');
}
