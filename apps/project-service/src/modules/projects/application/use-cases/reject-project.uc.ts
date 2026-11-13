import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { NOTIFICATION_SERVICE_PORT, NotificationServicePort } from '../ports/notification-service.port';
import { EmailTemplate } from '@app/common/generated/notification';

@Injectable()
export class RejectProjectUC {

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(NOTIFICATION_SERVICE_PORT)
    private readonly notificationService: NotificationServicePort,
  ) {}

  async execute(input: { id: number; actingUserId: number; reason?: string, eventType: string }) {
    const project = await this.repo.findById(input.id);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    if (project.state === 'REJECTED') {
      console.log('Project already rejected:', project.id);
      return project;
    }

    if (project.state !== 'UNDER_REVIEW') {
      throw new ValidationError(
        `El proyecto no se puede rechazar en el estado ${project.state}`,
      );
    }

    // Update project state to REJECTED and store the reason
    const rejectedProject = await this.repo.setProjectStateWithReason(
      project.id!,
      'REJECTED',
      input.reason,
    );

    // Notify all pending participants about the rejection
    const pendings = await this.repo.listPendingParticipants(project.id!);
    const template = input.eventType === 'Competition' ? EmailTemplate.PARTICIPANTS_REJECTED : EmailTemplate.PROJECT_REJECTED;

    for (const pending of pendings) {
      const firstName = pending.firstName || 'Estudiante';
      const lastName = pending.lastName || '';

      try {
        await this.notificationService.sendEmail({
          to: pending.email,
          template,
          params: {
            firstName,
            lastName,
            projectName: project.name,
            reason: input.reason || '',
          },
        });
      } catch (error) {
        console.error(`Failed to send rejection email to ${pending.email}:`, error);
        // Continue sending to other participants even if one fails
      }
    }

    return rejectedProject;
  }
}
