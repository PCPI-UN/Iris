import { JUROR_ROLE_ID } from './entities/project.entity';

/**
 * Who may read or edit one project (ClickUp 1dfnv12c650). The gateway only asks for a
 * session on these endpoints and calls CheckProjectAccess before acting.
 *
 * - READ: a confirmed participant, a juror assigned to the project, or platform staff
 *   with `read:events` (the dean and the faculty admin included).
 * - EDIT: a confirmed participant, or staff with `manage:events`.
 *
 * Admin passes like it does in the gateway guard. Pending participants (not yet joined)
 * do not count.
 */
export type ProjectAccessAction = 'READ' | 'EDIT';

export const READ_PROJECTS_PERMISSION = 'read:events';
export const EDIT_PROJECTS_PERMISSION = 'manage:events';
const ADMIN_ROLE_NAME = 'Admin';

export interface ProjectAccessFacts {
  isParticipant: boolean;
  assignedJurorUserIds: number[];
  roleNames: string[];
  permissions: string[];
}

export function canAccessProject(
  userId: number,
  action: ProjectAccessAction,
  facts: ProjectAccessFacts,
): boolean {
  if (facts.isParticipant) return true;
  if (facts.roleNames.includes(ADMIN_ROLE_NAME)) return true;

  if (action === 'READ') {
    return (
      facts.assignedJurorUserIds.includes(userId) ||
      facts.permissions.includes(READ_PROJECTS_PERMISSION)
    );
  }
  return facts.permissions.includes(EDIT_PROJECTS_PERMISSION);
}

/** Juror assignments of a project, as stored (memberRoleId 4 is the juror role) */
export function jurorUserIds(
  assignments: { memberUserId: number; memberRoleId: number }[],
): number[] {
  return assignments
    .filter((assignment) => assignment.memberRoleId === JUROR_ROLE_ID)
    .map((assignment) => assignment.memberUserId);
}
