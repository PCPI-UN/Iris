import { ProjectReadScope } from '../read-scope';
import {TypedDocument, JurorKey, Project, UserParticipation, ProjectDocument, ProjectState, ProjectParticipant, StudentStatus, PendingProjectParticipant, PendingProjectTutor, PendingProjectTutorInput, Status, ProjectWithJurorIds } from '../entities/project.entity';

/** Course section (NRC within a term) a project belongs to, with its department. */
export interface AcademicCourseView {
  id: number;
  nrc: string;
  /** event-service term */
  termId: number;
  name: string;
  professorUserId: number;
  departmentId: number;
  departmentName: string;
}

/** A project as returned by the academic read endpoints. */
export interface ProjectInScope extends Project {
  createdAt: Date;
  updatedAt: Date;
  academicCourseId: number;
  /** Null for the fill course sections: -1 (created before course sections existed) and 0 (event without course) */
  academicCourse: AcademicCourseView | null;
  /** Confirmed participants, with the name and email of their account when it still exists. */
  participants: (ProjectParticipant & { firstName?: string; lastName?: string | null; email?: string })[];
  pendingParticipants: PendingProjectParticipant[];
  documents: ProjectDocument[];
  /** Jurors assigned to evaluate the project. */
  assignedJurorCount: number;
}

export interface ProjectRepository {
  create(input: {
    eventId: number;
    courseId: number;              
    name: string;
    projectCode?: string;
    description?: string;
    eventNumber?: string;
    state: ProjectState;           
    academicCourseId: number;
  }): Promise<Project>;

  /** Id of the course section with that NRC in the term, or null when there is none. */
  findAcademicCourseId(termId: number, nrc: string): Promise<number | null>;

  /** Real course sections of the term, by NRC; never the fill rows (-1 "no NRC" and 0 "not applicable"). */
  listAcademicCoursesByTerm(termId: number): Promise<AcademicCourseView[]>;

  findById(id: number): Promise<Project | null>;
  findManyByIds(ids: number[]): Promise<Project[]>;
  findProject(eventId: number, courseId: number, name: string): Promise<Project | null>;

  countAll(): Promise<number>;

  listByFilter(
    eventId: number,
    opts?: { courseId?: number; q?: string; currentPage?: number; itemsPerPage?: number; state?: ProjectState } 
  ): Promise<{ items: Project[]; total: number }>;

  /** The project of the event with exactly that name, or null. */
  findByEventAndName(eventId: number, name: string): Promise<Project | null>;

  /**
   * Writes the given basic data and category; the state is not editable here. Throws
   * ProjectNameTakenError when another project of the event already has the name. With
   * ifCurrent the write only applies if those fields still hold those values; otherwise it
   * throws ProjectChangedMeanwhileError.
   */
  updateProject(
    input: {
      id: number;
      name?: string;
      projectCode?: string | null;
      description?: string | null;
      eventNumber?: string | null;
      courseId?: number;
    },
    ifCurrent?: {
      name?: string;
      projectCode?: string | null;
      description?: string | null;
      eventNumber?: string | null;
      courseId?: number;
    },
  ): Promise<Project>;

  setProjectState(id: number, state: ProjectState): Promise<Project>;
  setProjectStateWithReason(id: number, state: ProjectState, reason?: string): Promise<Project>;

  /**
   * Sets the state and the reason (null clears it) only if the project is still in `from`.
   * Returns null when its state is no longer `from`: another change got there first.
   */
  changeStateIfCurrent(
    id: number,
    from: ProjectState,
    to: ProjectState,
    reason: string | null,
  ): Promise<Project | null>;

  delete(id: number): Promise<void>;

  addDocument(projectId: number, url: string, type: TypedDocument ): Promise<ProjectDocument>;

  /** ACTIVE documents of the project, newest first; with includeInactive also the INACTIVE ones */
  listDocuments(
    projectId: number,
    opts?: { includeInactive?: boolean },
  ): Promise<ProjectDocument[]>;

  upsertAssignment(projectId: number, juror: JurorKey): Promise<void>;
  // Bulk assign juror to multiple projects in one operation
  bulkUpsertAssignments(projectIds: number[], juror: JurorKey): Promise<void>;
  /** Writes the assignments of several jurors at once, skipping the existing ones; returns how many were inserted */
  createAssignments(assignments: { projectId: number; juror: JurorKey }[]): Promise<number>;
  removeAssignment(projectId: number, juror: JurorKey): Promise<boolean>; // true si borró algo
  listAssignments(projectId: number): Promise<JurorKey[]>; // opcional útil

  addParticipant(input: { projectId: number; userId: number; studentCode: String}): Promise<ProjectParticipant>;
  listParticipants(projectId: number): Promise<ProjectParticipant[]>;

  addPendingParticipant(input: {
    projectId: number;
    firstName: string;
    lastName?: string | null;
    email: string;
    studentCode: string;
    semester: string;
    career: string;
    status: StudentStatus;
  }): Promise<PendingProjectParticipant>;
  listPendingParticipants(projectId: number): Promise<PendingProjectParticipant[]>;

  markPendingsInvited(projectId: number, emails: string[], invitedAt: Date): Promise<number>;

  /** Deletes the enrolled participant; false when the user was not a participant of the project. */
  removeParticipant(projectId: number, userId: number): Promise<boolean>;
  /** Deletes these pending participants of the project; returns how many were deleted. */
  removePendingParticipants(
    projectId: number,
    pendingIds: number[],
  ): Promise<number>;
  /**
   * Locks the project row until the current transaction ends, so two administrative changes of
   * its participants run one after the other. Only meaningful inside UnitOfWork.run.
   */
  lockProject(projectId: number): Promise<void>;
  /**
   * Locks one student (by normalized email) in one event until the current transaction ends, so
   * two administrative additions of the same student to two projects of the event cannot both
   * pass the "already in another project" check. Only meaningful inside UnitOfWork.run.
   */
  lockStudentInEvent(eventId: number, email: string): Promise<void>;

  markPendingJoined(projectId: number, studentCode: string, joinedAt: Date): Promise<boolean>;

  /** Idempotent: linking the same user twice keeps a single row. */
  addTutor(projectId: number, userId: number): Promise<void>;
  listTutorUserIds(projectId: number): Promise<number[]>;
  /** Leaves exactly these linked tutors and pending tutors (matched by email) on the project. */
  replaceTutors(projectId: number, userIds: number[], pendings: PendingProjectTutorInput[]): Promise<void>;
  addPendingTutor(projectId: number, input: PendingProjectTutorInput): Promise<PendingProjectTutor>;
  listPendingTutors(projectId: number): Promise<PendingProjectTutor[]>;
  /** Linked tutors of several projects in one query. */
  listTutorLinksByProjects(projectIds: number[]): Promise<{ projectId: number; userId: number }[]>;
  listPendingTutorsByProjects(projectIds: number[]): Promise<PendingProjectTutor[]>;
  /** Distinct events of the projects where the user is a participant, in any project state. */
  listEventIdsAsParticipant(userId: number): Promise<number[]>;
  /** Distinct events of the projects where the user is a linked tutor, in any project state. */
  listEventIdsAsTutor(userId: number): Promise<number[]>;
  markPendingTutorsInvited(projectId: number, emails: string[], invitedAt: Date): Promise<number>;
  markPendingTutorJoined(projectId: number, email: string, joinedAt: Date): Promise<boolean>;

  listAssignedToJuror(juror: JurorKey,opts?: { page?: number; pageSize?: number }
  ): Promise<{ items: Project[]; total: number }>;

  findDocumentById(id: number): Promise<ProjectDocument | null>;
  findProjectWithEvent(projectId: number): Promise<Project | null>;
  isUserParticipant(projectId: number, userId: number): Promise<boolean>;


  updateDocument(input: {
    id: number;
    url?: string;
    type?: TypedDocument;
    state?: Status;
  }): Promise<ProjectDocument>;

  findByEventIdAndUserId(eventId:number, userId: number): Promise<Project | null>;

  /** Every project of the event, in any state, with the user ids assigned as jurors */
  listWithJurorsByEvent(eventId: number): Promise<ProjectWithJurorIds[]>;
  listParticipationsByUser(userId: number, email: string): Promise<UserParticipation[]>;
  /** Projects where the user is a confirmed participant, filtered by state. */
  listProjectsByParticipant(userId: number, states: ProjectState[]): Promise<Project[]>;

  /** Projects inside the read scope, newest first; the filters are combined with AND. */
  listInScope(
    scope: ProjectReadScope,
    opts: { eventId?: number; state?: ProjectState; academicCourseId?: number; q?: string; currentPage: number; itemsPerPage: number },
  ): Promise<{ items: ProjectInScope[]; total: number }>;
  /** The project if it exists and is inside the read scope, otherwise null. */
  findInScope(scope: ProjectReadScope, projectId: number): Promise<ProjectInScope | null>;
  /** Distinct ids of the events with at least one project inside the read scope. */
  listEventIdsInScope(scope: ProjectReadScope): Promise<number[]>;
}
