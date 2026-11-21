import { InvitationTargetType } from '../entities/invitation.entity';

/**
 * Who may create each kind of invitation through POST /invitations (ClickUp 1dfnv12c650).
 * Accepting an invitation grants its roles, so creating one is as sensitive as granting them.
 *
 * - PLATFORM: `create:invitations`, and the roles must pass auth-service's administrator
 *   rules (platform roles only, Admin/FacultyAdmin only with `manage:admins`, never to oneself).
 * - EVENT: `manage:events` (the same permission that invites jurors to an event).
 * - PROJECT: a participant of the project or `manage:events`; roles: Participant only.
 * - PROJECT_TUTOR: a participant of the project or `manage:events`; roles: Tutor only.
 *
 * Admin passes every permission check, as in the gateway guard.
 */
export const CREATE_PLATFORM_INVITATIONS_PERMISSION = 'create:invitations';
export const MANAGE_EVENTS_PERMISSION = 'manage:events';
export const ADMIN_ROLE_NAME = 'Admin';

/** Role names a project invitation may carry, by target type */
export const PROJECT_INVITATION_ROLE_NAMES: Partial<Record<InvitationTargetType, string>> = {
  [InvitationTargetType.PROJECT]: 'Participant',
  [InvitationTargetType.PROJECT_TUTOR]: 'Tutor',
};

export function holds(
  access: { roleNames: string[]; permissions: string[] },
  permission: string,
): boolean {
  return (
    access.roleNames.includes(ADMIN_ROLE_NAME) ||
    access.permissions.includes(permission)
  );
}
