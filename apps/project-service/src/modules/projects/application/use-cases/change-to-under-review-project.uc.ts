import {Inject, Injectable} from '@nestjs/common';
import {ProjectRepository} from '../../domain/repositories/project.repository';
import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';

@Injectable()
export class ChangeToUnderReviewProjectUC {
    constructor(    
        @Inject('ProjectRepository') private readonly projectRepository: ProjectRepository,
    ) {}

    async execute(input: { projectId: number ; activeUserId: number }) {
        const project = await this.projectRepository.findById(input.projectId);

        if (!project) {
            throw new NotFoundError('No se encontró el proyecto');
        }

        const isParticipant = await this.projectRepository.isUserParticipant(input.projectId, input.activeUserId);
        if (!isParticipant) {
            throw new ForbiddenError('Solo los participantes del proyecto pueden pasarlo a revisión');
        }

        if (project.state === 'UNDER_REVIEW'){
            return project; // No hacemos nada si ya está en UNDER_REVIEW
        }

        if (project.state !== 'REQUEST_CHANGES') {
            throw new ValidationError('El proyecto debe estar en estado REQUEST_CHANGES para pasar a UNDER_REVIEW');
        }

        return this.projectRepository.setProjectStateWithReason(project.id, 'UNDER_REVIEW', ' ');
    }
}