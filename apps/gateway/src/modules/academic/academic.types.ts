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
