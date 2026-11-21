import {
  NewProjectChangeLogEntry,
  ProjectChangeLogEntry,
} from '../entities/project-change-log.entity';

export const PROJECT_CHANGE_LOG_REPOSITORY = 'ProjectChangeLogRepository';

export interface ProjectChangeLogRepository {
  create(entry: NewProjectChangeLogEntry): Promise<ProjectChangeLogEntry>;
  /** Entries of the project, most recent first. */
  listByProject(projectId: number): Promise<ProjectChangeLogEntry[]>;
}
