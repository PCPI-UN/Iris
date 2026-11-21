import {
  NewProjectChangeLogEntry,
  ProjectChangeAction,
  ProjectChangeValues,
} from './entities/project-change-log.entity';

export interface ProjectChangeInput {
  projectId: number;
  actorUserId: number;
  action: ProjectChangeAction;
  /** Values before the change; may hold fields that did not change */
  before: ProjectChangeValues;
  /** Values after the change; may hold fields that did not change */
  after: ProjectChangeValues;
  reason?: string | null;
}

const isIdList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

/** Lists of ids are sets: [4, 3] and [3, 4] are the same value, stored in ascending order. */
const normalize = (value: unknown): unknown =>
  isIdList(value) ? [...value].sort((a, b) => a - b) : (value ?? null);

/**
 * Fields whose value differs between before and after, compared as JSON. A missing field
 * counts as null, and lists of ids are compared without regard to order.
 */
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
    const oldValue = normalize(before[key]);
    const newValue = normalize(after[key]);
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    result.before[key] = oldValue;
    result.after[key] = newValue;
  }
  return result;
}

/**
 * Change log entry of an administrative edit, with only the fields that changed, or null
 * when no field changed. The use case passes it to the repository method that makes the
 * edit, which inserts it in the same transaction, so an edit is never saved without its entry.
 */
export function buildProjectChangeLogEntry(
  input: ProjectChangeInput,
): NewProjectChangeLogEntry | null {
  const diff = changedFields(input.before, input.after);
  if (!Object.keys(diff.after).length) return null;
  const reason = input.reason?.trim();
  return {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    action: input.action,
    before: diff.before,
    after: diff.after,
    reason: reason ? reason : null,
  };
}
