import { ProjectState } from '../../domain/entities/project.entity';

export interface ListProjectsInScopeDTO {
  userId: number;
  eventId?: number;
  state?: ProjectState;
  academicCourseId?: number;
  q?: string;
  currentPage?: number; // default 1
  itemsPerPage?: number; // default 10, at most 100
}

export interface GetProjectInScopeDTO {
  userId: number;
  projectId: number;
}

export interface ListEventIdsInScopeDTO {
  userId: number;
}
