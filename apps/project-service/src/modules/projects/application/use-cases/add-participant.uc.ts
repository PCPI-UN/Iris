import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { AddParticipantDTO } from '../dto/add-participant.dto';
import { NotFoundError, ValidationError } from '../../domain/errors';

@Injectable()
export class AddParticipantUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: AddParticipantDTO) {

    if (!input.projectId || input.projectId <= 0) throw new ValidationError('projectId no es válido');
    if (!input.userId || input.userId <= 0) throw new ValidationError('userId no es válido');

    const p = await this.repo.findById(input.projectId);
    if (!p) throw new NotFoundError('No se encontró el proyecto');

    // Crea o actualiza (upsert) el participante
    const participant = await this.repo.addParticipant({
      projectId: input.projectId,
      userId: input.userId,
      studentCode: input.studentCode,
    });
    await this.repo.markPendingJoined(
      input.projectId,
      input.studentCode,
      new Date()
    );

    return participant;
  }
}
