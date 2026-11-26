import { ProjectState } from '../../domain/entities/project.entity';
import { RequestedReadScope } from '../../domain/read-scope';

export interface ListProjectsInScopeDTO {
  userId: number;
  eventId?: number;
  state?: ProjectState;
  academicCourseId?: number;
  q?: string;
  currentPage?: number; // default 1
  itemsPerPage?: number; // default 10, at most 100
  scope?: RequestedReadScope; // unset: the union of the user's scopes
}

export interface GetProjectInScopeDTO {
  userId: number;
  projectId: number;
  scope?: RequestedReadScope;
}

export interface ListEventIdsInScopeDTO {
  userId: number;
  scope?: RequestedReadScope;
}
