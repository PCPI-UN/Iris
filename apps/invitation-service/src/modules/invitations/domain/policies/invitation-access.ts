import { InvitationTargetType } from '../entities/invitation.entity';

/**
 * Who may create each kind of invitation through POST /invitations.
 * Accepting an invitation grants its roles, so creating one is as sensitive as granting them.
 *
 * - PLATFORM: `create:invitations`, and the roles must pass auth-service's administrator
 *   rules (platform roles only, Admin/FacultyAdmin only with `manage:admins`, never to oneself).
 *   Without roles the invitee joins with the base role only, so there is nothing to check.
 * - EVENT: `manage:events` (the same permission that invites jurors to an event).
 * - PROJECT: a participant of the project or `manage:events`; roles: Participant only.
 * - PROJECT_TUTOR: a participant of the project or `manage:events`; roles: Tutor only.
 *
 * Admin passes because its role holds every one of these permissions.
 */
export const CREATE_PLATFORM_INVITATIONS_PERMISSION = 'create:invitations';
export const MANAGE_EVENTS_PERMISSION = 'manage:events';

/** Role names a project invitation may carry, by target type */
export const PROJECT_INVITATION_ROLE_NAMES: Partial<Record<InvitationTargetType, string>> = {
  [InvitationTargetType.PROJECT]: 'Participant',
  [InvitationTargetType.PROJECT_TUTOR]: 'Tutor',
};

export function holds(permissions: string[], permission: string): boolean {
  return permissions.includes(permission);
}
