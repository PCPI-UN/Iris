import { Injectable, Logger } from '@nestjs/common';
import { NotificationServicePort } from '../ports/notification-service.port';
import { NotificationGrpcClient } from '../../../../common/grpc-client/notification.grpc-client';
import { EmailTemplate } from '@app/common/generated/notification';

@Injectable()
export class NotificationServiceAdapter implements NotificationServicePort {
  private readonly logger = new Logger(NotificationServiceAdapter.name);

  constructor(private readonly grpc: NotificationGrpcClient) { }

  async sendEmail(params: {
    to: string;
    template: EmailTemplate;
    params: Record<string, any>;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }> {
    try {
      const res = await this.grpc.sendEmail(
        params.to,
        params.template,
        params.params,
        params.idempotencyKey,
      );
      return { success: res.success };
    } catch (err) {
      // Don't break the invitation flow if email fails
      this.logger.error('Error sending notification email', err as any);
      return { success: false };
    }
  }

  async sendPlatformInvitationEmail(params: {
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    roles: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }> {
    return this.sendEmail({
      to: params.to,
      idempotencyKey: params.idempotencyKey,
      template: EmailTemplate.PLATFORM_INVITATION,
      params: {
        firstName: params.firstName,
        lastName: params.lastName || '',
        invitationLink: params.invitationLink,
        roles: params.roles,
      },
    });
  }

  async sendJurorInvitationEmail(params: {
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    eventName: string;
    eventDescription: string;
    roles: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }> {
    return this.sendEmail({
      to: params.to,
      idempotencyKey: params.idempotencyKey,
      template: EmailTemplate.JUROR_INVITATION,
      params: {
        firstName: params.firstName,
        lastName: params.lastName || '',
        invitationLink: params.invitationLink,
        eventName: params.eventName,
        eventDescription: params.eventDescription,
        roles: params.roles,
      },
    });
  }

  async sendProjectSubmittedInvitationEmail(params: {
    to: string;
    eventType: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    projectName: string;
    eventName: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean }> {
    const template = params.eventType === 'Exposition'
      ? EmailTemplate.PROJECT_SUBMITTED
      : EmailTemplate.PARTICIPANTS_SUBMITTED;

    return this.sendEmail({
      to: params.to,
      idempotencyKey: params.idempotencyKey,
      template,
      params: {
        firstName: params.firstName,
        lastName: params.lastName || '',
        invitationLink: params.invitationLink,
        projectName: params.projectName,
        eventName: params.eventName,
      },
    });
  }
}
