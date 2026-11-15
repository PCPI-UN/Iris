export type ProjectState = 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
export type StudentStatus = 'PENDING' | 'INVITED' | 'JOINED';
export type TypedDocument = 'LOGO' | 'POSTER' | 'SUPPORTING_DOCUMENT';
export type Status = 'ACTIVE' | 'INACTIVE';

export interface Project {
  id: number;
  eventId: number;
  courseId: number ;
  name: string;
  projectCode?: string | null;
  description?: string | null;
  eventNumber?: string | null;
  state: ProjectState;
  reason?: string | null;
}

export interface ProjectDocument {
  id: number;
  projectId: number;
  type: DocumentType;
  state : Status;
  url: string;
}

/** Role id stored in project assignments for jurors */
export const JUROR_ROLE_ID = 4;
/** Platform roles: Professor may be chosen as tutor; the tutor of a project always ends up with Tutor. */
export const PROFESSOR_ROLE_ID = 9;
export const TUTOR_ROLE_ID = 10;

/** A project of an event with the users assigned to it as jurors */
export interface ProjectWithJurorIds extends Project {
  jurorUserIds: number[];
}

export interface JurorKey {
  memberUserId: number;
  memberEventId: number;
  memberRoleId: number;
}

export interface ProjectParticipant {
  userId: number;
  projectId: number;
  studentCode: string;
}

// A confirmed participation of a user, with the academic data captured at submission
export interface UserParticipation {
  project: Project;
  studentCode: string;
  career?: string | null;
  semester?: string | null;
}

export interface ProjectParticipantWithUserInfo {
  userId: number;
  projectId: number;
  studentCode: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  semester?: string | null;
  career?: string | null;
  status: StudentStatus;
}

export interface PendingProjectParticipant {
  projectId: number;
  firstName: string;
  lastName?: string | null;
  email: string;
  studentCode: string;
  semester: string;
  career: string;
  status: StudentStatus;
}

/** Tutor typed in at submission who has no platform account yet. */
export interface PendingProjectTutor {
  projectId: number;
  firstName: string;
  lastName?: string | null;
  email: string;
  status: StudentStatus;
}

/** Tutor as shown in reads: linked (userId set) or pending. */
export interface ProjectTutorView {
  userId?: number;
  firstName: string;
  lastName?: string | null;
  pending: boolean;
  /** Only for pending tutors. */
  email?: string;
}

export interface PendingProjectTutorInput {
  firstName: string;
  lastName?: string | null;
  email: string;
}

/** Course section (NRC within a term) a project belongs to, with its department. */
export interface AcademicCourseView {
  id: number;
  nrc: string;
  term: string;
  name: string;
  professorUserId: number;
  departmentId: number;
  departmentName: string;
}

/** A project as returned by the academic read endpoints. */
export interface ProjectInScope extends Project {
  createdAt: Date;
  updatedAt: Date;
  academicCourseId: number | null;
  academicCourse: AcademicCourseView | null;
  /** Confirmed participants, with the name and email of their account when it still exists. */
  participants: (ProjectParticipant & { firstName?: string; lastName?: string | null; email?: string })[];
  pendingParticipants: PendingProjectParticipant[];
  documents: ProjectDocument[];
  /** Jurors assigned to evaluate the project. */
  assignedJurorCount: number;
}
