import { ProjectComplete } from '@app/common/generated/project';
import { ResultComponent } from '@app/common/utils/project-result.util';

/** Review state of a project, as project-service returns it */
export type ProjectReviewState =
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REQUEST_CHANGES';

export interface AcademicCourseSummary {
  id: number;
  nrc: string;
  /** event-service term */
  termId: number;
  /** Term code (year + period, such as 202610); null if event-service does not list the term */
  term: string | null;
  name: string;
  departmentName: string;
}

export interface AcademicEvent {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  inscriptionDeadline: string;
  active: boolean;
  evaluationsOpened: boolean;
  resultsPublished: boolean;
  /** Each project needs a course section (NRC); false for events that are not course work */
  requiresCourse: boolean;
}

/** A student of a project: confirmed (has an account in the project) or still pending */
export interface RegistrationStudent {
  /** CONFIRMED: joined the project; PENDING: captured at submission; INVITED: invitation sent */
  status: 'CONFIRMED' | 'PENDING' | 'INVITED';
  userId: number | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  studentCode: string;
  semester: string | null;
  career: string | null;
}

export interface RegistrationProject {
  projectId: number;
  projectCode: string | null;
  projectName: string;
  state: ProjectReviewState;
  /** Reason of the last rejection or change request */
  reason: string | null;
  academicCourse: AcademicCourseSummary | null;
  tutors: string[];
  students: RegistrationStudent[];
}

export interface RegistrationsReport {
  eventId: number;
  eventName: string;
  totals: {
    projects: number;
    byState: Record<ProjectReviewState, number>;
    confirmedStudents: number;
    pendingStudents: number;
  };
  projects: RegistrationProject[];
}

/**
 * PENDING: no juror has evaluated the project yet.
 * PRELIMINARY: it has evaluations, but the event results are not published.
 * OFFICIAL: the event results are published.
 */
export type GradeStatus = 'PENDING' | 'PRELIMINARY' | 'OFFICIAL';

export interface GradeRow {
  projectId: number;
  projectCode: string | null;
  projectName: string;
  participantNames: string[];
  academicCourse: AcademicCourseSummary | null;
  gradeStatus: GradeStatus;
  assignedJurors: number;
  completedEvaluations: number;
  pendingEvaluations: number;
  /** Average of the jurors' grades; null when there is none or the caller may not see it yet */
  finalScore: number | null;
  /** true when a grade exists but stays hidden until the results are published */
  gradeHidden: boolean;
}

export interface GradesReport {
  eventId: number;
  eventName: string;
  resultsPublished: boolean;
  /** ALL: the caller sees grades before publication; PUBLISHED_ONLY: only after it */
  gradeVisibility: 'ALL' | 'PUBLISHED_ONLY';
  generatedAt: Date;
  projects: GradeRow[];
}

/** Result of a project, as evaluation-service consolidates it (GetProjectResult) */
export interface AcademicProjectResult {
  /** Average of the jurors' grades, rounded as the ranking does */
  finalScore: number;
  /** Highest grade possible with the event's evaluation type */
  maxScore: number;
  /** Criteria by component, with the effective weights (fraction, 0-1) */
  components: ResultComponent[];
  /** Each juror's comment, without saying who wrote it; empty when there are none */
  comments: string[];
  /** Each juror's evaluation without the juror, oldest first (the front calls them Jurado A, B...) */
  evaluations: AcademicJurorEvaluation[];
}

/** One juror's evaluation in the academic detail; no juror id nor name */
export interface AcademicJurorEvaluation {
  /** The juror's grade, rounded as the ranking does */
  grade: number;
  /** The juror's own score per criterion, grouped by component */
  components: ResultComponent[];
  /** null when the juror left no comment */
  comment: string | null;
}

/** Position of the project in the ranking of its category, with the ranking rule */
export interface AcademicProjectRanking {
  /** Dense position over the rounded averages: tied projects share it */
  position: number;
  /** true when another project shares the position */
  tied: boolean;
  categoryId: number;
  categoryName: string;
  /** Titles of the published awards the project won in the event, comma separated; null if none */
  awardTitle: string | null;
}

/** A juror assigned to the project and whether they have evaluated it; never their grade */
export interface AcademicProjectJuror {
  userId: number;
  /** null when auth-service does not return the user */
  name: string | null;
  evaluated: boolean;
}

/**
 * Evaluation of a project for the academic detail. The juror counters and the jurors
 * are always sent; the result and the position follow the grade rule of
 * /academic/grades.
 */
export interface AcademicProjectEvaluation {
  gradeStatus: GradeStatus;
  assignedJurors: number;
  completedEvaluations: number;
  pendingEvaluations: number;
  /** Assigned jurors, the pending ones first, then by name */
  jurors: AcademicProjectJuror[];
  /** true when a result exists but stays hidden until the results are published */
  resultHidden: boolean;
  /** null while PENDING or hidden */
  result: AcademicProjectResult | null;
  /**
   * null while PENDING or hidden, for a project that is not approved, or when the event has
   * no ranking configuration
   */
  ranking: AcademicProjectRanking | null;
}

/** A project of the caller's scope, with its evaluation */
export type AcademicProjectDetail = ProjectComplete & {
  /** null when event-service or evaluation-service could not give it; the project is still sent */
  evaluation: AcademicProjectEvaluation | null;
};
