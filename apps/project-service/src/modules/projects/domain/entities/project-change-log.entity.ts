/** What an administrative correction of a project changed, or CREATED for its creation by an administrator. */
export const PROJECT_CHANGE_ACTIONS = [
  'STATE',
  'INFO',
  'CATEGORY',
  'PARTICIPANTS',
  'TUTORS',
  'DOCUMENTS',
  'CREATED',
] as const;

export type ProjectChangeAction = (typeof PROJECT_CHANGE_ACTIONS)[number];

/** JSON object with the changed fields only: field name → value. */
export type ProjectChangeValues = Record<string, unknown>;

/** One administrative correction of a project: who changed what, and why. */
export interface ProjectChangeLogEntry {
  id: number;
  projectId: number;
  /** Platform user (auth-service) who made the change */
  actorUserId: number;
  action: ProjectChangeAction;
  /** Values of the changed fields before the change */
  before: ProjectChangeValues;
  /** Values of the changed fields after the change */
  after: ProjectChangeValues;
  reason: string | null;
  createdAt: Date;
}

export type NewProjectChangeLogEntry = Omit<
  ProjectChangeLogEntry,
  'id' | 'createdAt'
>;
