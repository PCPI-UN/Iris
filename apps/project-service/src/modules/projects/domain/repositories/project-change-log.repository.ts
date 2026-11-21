import { ProjectChangeLogEntry } from '../entities/project-change-log.entity';

export const PROJECT_CHANGE_LOG_REPOSITORY = 'ProjectChangeLogRepository';

/**
 * Read side of project_change_log. Entries are not written here: the repository method that
 * makes an administrative edit receives the entry (buildProjectChangeLogEntry) and inserts it
 * in the same transaction as the edit.
 */
export interface ProjectChangeLogRepository {
  /** Entries of the project, most recent first. */
  listByProject(projectId: number): Promise<ProjectChangeLogEntry[]>;
}
