import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { PendingProjectParticipant, ProjectParticipantWithUserInfo } from '../../domain/entities/project.entity';
import { ListDocumentsUC } from './list-documents.uc';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class GetMyProjectByEventUC {
    constructor(
        @Inject('ProjectRepository') private readonly repo: ProjectRepository,
        private readonly listDocumentsUC: ListDocumentsUC,
    ) { }

    async execute(input: { eventId: number; userId: number }) {
        const project = await this.repo.findByEventIdAndUserId(input.eventId, input.userId);
        if (!project) {
            throw new NotFoundError('El usuario no tiene un proyecto en el evento indicado');
        }

        const [pendingParticipants, documents] = await Promise.all([
            this.repo.listPendingParticipants(project.id),
            this.listDocumentsUC.execute({ projectId: project.id }),
        ]);

        const participants: ProjectParticipantWithUserInfo[] = pendingParticipants.map((participant: PendingProjectParticipant) => ({
            userId: 0,
            projectId: participant.projectId,
            studentCode: participant.studentCode,
            firstName: participant.firstName ?? null,
            lastName: participant.lastName ?? null,
            email: participant.email ?? null,
            semester: participant.semester ?? null,
            career: participant.career ?? null,
            status: participant.status,
        }));

        return {
            ...project,
            participants,
            documents,
        };
    }
}
