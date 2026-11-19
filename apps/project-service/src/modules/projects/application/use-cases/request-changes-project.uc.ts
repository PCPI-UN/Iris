import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { NOTIFICATION_SERVICE_PORT, NotificationServicePort } from '../ports/notification-service.port';
import { EmailTemplate } from '@app/common/generated/notification';

@Injectable()
export class RequestChangesProjectUC {

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(NOTIFICATION_SERVICE_PORT)
    private readonly notificationService: NotificationServicePort,
  ) {}

  async execute(input: { id: number; actingUserId: number; reason?: string }) {
    const project = await this.repo.findById(input.id);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    if (project.state === 'REQUEST_CHANGES') {
      console.log('You have already requested changes to this project:', project.id);
      return project;
    }

    if (project.state !== 'UNDER_REVIEW') {
      throw new ValidationError(
        `No se pueden solicitar cambios a un proyecto en el estado ${project.state}`,
      );
    }

    // Update project state to REQUEST_CHANGES and store the reason
    const requestedChange = await this.repo.setProjectStateWithReason(
      project.id!,
      'REQUEST_CHANGES',
      input.reason,
    );

    // Notify all pending participants about the changes requested
    const pendings = await this.repo.listPendingParticipants(project.id!);

    for (const pending of pendings) {
      const firstName = pending.firstName || 'Estudiante';
      const lastName = pending.lastName || '';

      try {
        await this.notificationService.sendEmail({
          to: pending.email,
          template: EmailTemplate.REQUEST_CHANGES,
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

    return requestedChange;
  }
}
