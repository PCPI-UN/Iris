import { JUROR_ROLE_ID } from './entities/project.entity';

/**
 * Who may read or edit one project. The gateway only asks for a
 * session on these endpoints and calls CheckProjectAccess before acting.
 *
 * - READ: a confirmed participant, a juror assigned to the project, or platform staff
 *   with `read:events` (the dean and the faculty admin included).
 * - EDIT: a confirmed participant, or staff with `manage:events`.
 *
 * Admin passes because its role holds both permissions. Pending participants (not yet
 * joined) do not count. A tutor reads the projects they tutor through the academic read
 * endpoints (domain/read-scope.ts), not here.
 */
export type ProjectAccessAction = 'READ' | 'EDIT';

export const READ_PROJECTS_PERMISSION = 'read:events';
export const EDIT_PROJECTS_PERMISSION = 'manage:events';

export interface ProjectAccessFacts {
  isParticipant: boolean;
  assignedJurorUserIds: number[];
  permissions: string[];
}

export function canAccessProject(
  userId: number,
  action: ProjectAccessAction,
  facts: ProjectAccessFacts,
): boolean {
  if (facts.isParticipant) return true;

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
