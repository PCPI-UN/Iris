import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailTemplate } from '@app/common/generated/notification';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  NOTIFICATION_SERVICE_PORT,
  NotificationServicePort,
} from '../ports/notification-service.port';
import { SetProjectTutorsUC } from '../use-cases/set-project-tutors.uc';

/** Email template of the approval, which depends on the event type */
export const approvalTemplate = (eventType?: string): EmailTemplate =>
  eventType === 'Competition'
    ? EmailTemplate.PARTICIPANTS_APPROVED
    : EmailTemplate.PROJECT_APPROVED;

/**
 * What happens when a project becomes APPROVED, shared by the normal approval and the
 * administrative state change: the pending participants get the approval email, and the
 * tutors get the Tutor role and the pending tutors their invitation.
 */
@Injectable()
export class ProjectApprovalEffects {
  private readonly logger = new Logger(ProjectApprovalEffects.name);

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(NOTIFICATION_SERVICE_PORT)
    private readonly notificationService: NotificationServicePort,
    private readonly tutors: SetProjectTutorsUC,
  ) {}

  /** Approval email to every pending participant; one failed email does not stop the others. */
  async notifyPendingParticipants(
    project: { id: number; name: string },
    eventType?: string,
  ): Promise<void> {
    await this.notifyPendingParticipantsWith(
      project,
      approvalTemplate(eventType),
    );
  }

  /**
   * Sends one template to every pending participant of the project, with the same params
   * as the approval, rejection and request-changes use cases (reason only when given).
   */
  async notifyPendingParticipantsWith(
    project: { id: number; name: string },
    template: EmailTemplate,
    reason?: string,
  ): Promise<{ sent: number; failed: number }> {
    const pendings = await this.repo.listPendingParticipants(project.id);
    let failed = 0;
    for (const pending of pendings) {
      try {
        await this.notificationService.sendEmail({
          to: pending.email,
          template,
          params: {
            firstName: pending.firstName || 'Estudiante',
            lastName: pending.lastName || '',
            projectName: project.name,
            ...(reason !== undefined ? { reason } : {}),
          },
        });
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Failed to send email to ${pending.email}`,
          error instanceof Error ? error.stack : String(error),
        );
        // Continue sending to other participants even if one fails
      }
    }
    return { sent: pendings.length - failed, failed };
  }

  /** Tutor role for the linked tutors and invitations for the pending ones; safe to repeat. */
  async activateTutors(projectId: number, eventType?: string): Promise<void> {
    await this.tutors.activate(projectId, eventType);
  }
}
