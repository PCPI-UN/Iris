import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class ListPendingParticipantsUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}
    async execute(input: { projectId: number }) {
        // Asegura que el proyecto exista
        const project = await this.repo.findById(input.projectId);
        if (!project) throw new NotFoundError('No se encontró el proyecto');
        
        return this.repo.listPendingParticipants(input.projectId);
    }
}