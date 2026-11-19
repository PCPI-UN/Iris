import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { NOTIFICATION_SERVICE_PORT, NotificationServicePort } from '../ports/notification-service.port';
import { EmailTemplate } from '@app/common/generated/notification';

@Injectable()
export class ApproveProjectUC implements OnModuleInit {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(NOTIFICATION_SERVICE_PORT) private readonly notificationService: NotificationServicePort,
  ) { }

  onModuleInit() {}

  async execute(input: { id: number; actingUserId: number, eventType: string }) {
    const project = await this.repo.findById(input.id);
    if (!project) throw new NotFoundError('No se encontró el proyecto');
    //console.log('Approving project:', project);

    if (project.state === 'APPROVED') {
      console.log('Project already approved:', project.id);
      return project;
    }

    if (project.state !== 'UNDER_REVIEW') {
      throw new ValidationError(
        `El proyecto no se puede aprobar en el estado ${project.state}`,
      );
    }

    const projectUpdated = await this.repo.setProjectState(project.id!, 'APPROVED');

    // Notify all pending participants about the approval
    const pendings = await this.repo.listPendingParticipants(project.id!);
    const template = input.eventType === 'Competition' ? EmailTemplate.PARTICIPANTS_APPROVED : EmailTemplate.PROJECT_APPROVED;

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
          },
        });
      } catch (error) {
        console.error(`Failed to send approval email to ${pending.email}:`, error);
        // Continue sending to other participants even if one fails
      }
    }

    return projectUpdated;
  }
}
