import {
  NewProjectChangeLogEntry,
  ProjectChangeLogEntry,
} from '../entities/project-change-log.entity';

export const PROJECT_CHANGE_LOG_REPOSITORY = 'ProjectChangeLogRepository';

/**
 * project_change_log. An administrative edit calls `create` inside `UnitOfWork.run`, together
 * with the edit, so the edit and its entry are saved together or not at all.
 */
export interface ProjectChangeLogRepository {
  create(entry: NewProjectChangeLogEntry): Promise<ProjectChangeLogEntry>;

  /** Entries of the project, most recent first. */
  listByProject(projectId: number): Promise<ProjectChangeLogEntry[]>;
}
