import { EmailTemplate } from '@app/common/generated/notification';

/**
 * Idempotency key of an invitation email. The expiry is part of it so that a
 * resend (new expiry) sends a new email, while a repeated call does not.
 */
export const invitationEmailKey = (invitationId: string, expiresAt: Date) =>
  `invitation:${invitationId}:${expiresAt.getTime()}`;

export abstract class NotificationServicePort {
  abstract sendEmail(params: {
    to: string;
    template: EmailTemplate;
    params: Record<string, any>;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }>;

  /**
   * Sends a platform invitation email to a user
   */
  abstract sendPlatformInvitationEmail(params: {
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    roles: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }>;

  /**
   * Sends a juror invitation email for an event
   */
  abstract sendJurorInvitationEmail(params: {
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    eventName: string;
    eventDescription: string;
    roles: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }>;

  /**
   * Sends a project submitted invitation email
   */
  abstract sendProjectSubmittedInvitationEmail(params: {
    to: string;
    eventType: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    projectName: string;
    eventName: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }>;
}
