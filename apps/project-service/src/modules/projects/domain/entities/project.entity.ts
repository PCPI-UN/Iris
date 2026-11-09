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
