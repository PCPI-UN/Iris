import { EmailTemplate } from '@app/common/generated/notification';

export abstract class NotificationServicePort {
  abstract sendEmail(params: {
    to: string;
    template: EmailTemplate;
    params: Record<string, any>;
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
  }): Promise<{ success: boolean }>;

  /**
   * Sends the invitation email to a tutor of a project
   */
  abstract sendProjectTutorInvitationEmail(params: {
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    projectName: string;
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
  }): Promise<{ success: boolean }>;
}
