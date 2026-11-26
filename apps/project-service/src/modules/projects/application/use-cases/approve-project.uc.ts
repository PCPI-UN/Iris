import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { ProjectApprovalEffects } from '../services/project-approval-effects.service';

@Injectable()
export class ApproveProjectUC implements OnModuleInit {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly approvalEffects: ProjectApprovalEffects,
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
    await this.approvalEffects.notifyPendingParticipants(
      { id: project.id, name: project.name },
      input.eventType,
    );

    return projectUpdated;
  }
}
