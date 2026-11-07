import {TypedDocument, JurorKey, Project, ProjectDocument, ProjectState, ProjectParticipant, StudentStatus, PendingProjectParticipant, Status, ProjectWithJurorIds } from '../entities/project.entity';

export interface ProjectRepository {
  create(input: {
    eventId: number;
    courseId: number;              
    name: string;
    projectCode?: string;
    description?: string;
    eventNumber?: string;
    state: ProjectState;           
  }): Promise<Project>;

  findById(id: number): Promise<Project | null>;
  findManyByIds(ids: number[]): Promise<Project[]>;
  findProject(eventId: number, courseId: number, name: string): Promise<Project | null>;

  countAll(): Promise<number>;

  listByFilter(
    eventId: number,
    opts?: { courseId?: number; q?: string; currentPage?: number; itemsPerPage?: number; state?: ProjectState } 
  ): Promise<{ items: Project[]; total: number }>;

  updateProject(input: {
    id: number;
    name?: string;
    description?: string | null;
    eventNumber?: string | null;
    courseId?: number;
    state?: ProjectState;
  }): Promise<Project>;

  setProjectState(id: number, state: ProjectState): Promise<Project>;
  setProjectStateWithReason(id: number, state: ProjectState, reason?: string): Promise<Project>;

  delete(id: number): Promise<void>;

  addDocument(projectId: number, url: string, type: TypedDocument ): Promise<ProjectDocument>;

  listDocuments(projectId: number): Promise<ProjectDocument[]>;

  upsertAssignment(projectId: number, juror: JurorKey): Promise<void>;
  // Bulk assign juror to multiple projects in one operation
  bulkUpsertAssignments(projectIds: number[], juror: JurorKey): Promise<void>;
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

  markPendingJoined(projectId: number, studentCode: string, joinedAt: Date): Promise<boolean>;

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
}
