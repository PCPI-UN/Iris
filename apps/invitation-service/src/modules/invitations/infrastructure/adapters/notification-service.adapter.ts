import { Injectable, Logger } from '@nestjs/common';
import { EmailStatus, NotificationServicePort } from '../ports/notification-service.port';
import { NotificationGrpcClient } from '../../../../common/grpc-client/notification.grpc-client';
import { EmailDeliveryStatus, EmailTemplate } from '@app/common/generated/notification';

/** notification-service rejects more lookups than this per call */
const MAX_LOOKUPS = 100;

/** Only these statuses leave the service; anything else (UNRECOGNIZED, new values) is unknown */
const EMAIL_STATUS: Partial<Record<EmailDeliveryStatus, EmailStatus>> = {
  [EmailDeliveryStatus.PENDING]: 'PENDING',
  [EmailDeliveryStatus.SENT]: 'SENT',
  [EmailDeliveryStatus.FAILED]: 'FAILED',
};

@Injectable()
export class NotificationServiceAdapter implements NotificationServicePort {
  private readonly logger = new Logger(NotificationServiceAdapter.name);

  constructor(private readonly grpc: NotificationGrpcClient) { }

  async getEmailStatuses(keys: string[]): Promise<Map<string, EmailStatus>> {
    const statuses = new Map<string, EmailStatus>();
    for (let i = 0; i < keys.length; i += MAX_LOOKUPS) {
      try {
        const res = await this.grpc.getEmailStatus(
          keys.slice(i, i + MAX_LOOKUPS),
        );
        for (const delivery of res.deliveries) {
          const status = EMAIL_STATUS[delivery.status];
          if (delivery.idempotencyKey && status) {
            statuses.set(delivery.idempotencyKey, status);
          }
        }
      } catch (err) {
        // A failed batch only leaves its own keys without status
        this.logger.warn(
          `Could not load email statuses for a batch of ${keys.slice(i, i + MAX_LOOKUPS).length} keys: ${(err as Error).message}`,
        );
      }
    }
    return statuses;
  }

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

  async sendProjectTutorInvitationEmail(params: {
    to: string;
    firstName: string;
    lastName?: string;
    invitationLink: string;
    projectName: string;
  }): Promise<{ success: boolean }> {
    return this.sendEmail({
      to: params.to,
      template: EmailTemplate.PROJECT_TUTOR_INVITATION,
      params: {
        firstName: params.firstName,
        lastName: params.lastName || '',
        invitationLink: params.invitationLink,
        projectName: params.projectName,
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
