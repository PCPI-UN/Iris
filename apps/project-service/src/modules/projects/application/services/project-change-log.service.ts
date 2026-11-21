import { Inject, Injectable } from '@nestjs/common';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import {
  ProjectChangeAction,
  ProjectChangeLogEntry,
  ProjectChangeValues,
} from '../../domain/entities/project-change-log.entity';

export interface RecordProjectChangeInput {
  projectId: number;
  actorUserId: number;
  action: ProjectChangeAction;
  /** Values before the change; may hold fields that did not change */
  before: ProjectChangeValues;
  /** Values after the change; may hold fields that did not change */
  after: ProjectChangeValues;
  reason?: string | null;
}

/** Fields whose value differs between before and after (compared as JSON). */
export function changedFields(
  before: ProjectChangeValues,
  after: ProjectChangeValues,
): { before: ProjectChangeValues; after: ProjectChangeValues } {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const result = {
    before: {} as ProjectChangeValues,
    after: {} as ProjectChangeValues,
  };
  for (const key of keys) {
    const oldValue = before[key] ?? null;
    const newValue = after[key] ?? null;
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    result.before[key] = oldValue;
    result.after[key] = newValue;
  }
  return result;
}

/**
 * Records the administrative corrections of projects in project_change_log.
 * Used by every administrative edit (state, data, category, members, tutors, documents).
 */
@Injectable()
export class ProjectChangeLogService {
  constructor(
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly repo: ProjectChangeLogRepository,
  ) {}

  /**
   * Stores only the fields that changed. Returns null, writing nothing, when no field changed.
   */
  async record(
    input: RecordProjectChangeInput,
  ): Promise<ProjectChangeLogEntry | null> {
    const diff = changedFields(input.before, input.after);
    if (!Object.keys(diff.after).length) return null;
    const reason = input.reason?.trim();
    return this.repo.create({
      projectId: input.projectId,
      actorUserId: input.actorUserId,
      action: input.action,
      before: diff.before,
      after: diff.after,
      reason: reason ? reason : null,
    });
  }
}
