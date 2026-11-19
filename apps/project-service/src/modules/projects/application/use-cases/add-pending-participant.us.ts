import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { AddPendingParticipantDTO } from '../dto/add-pending-participant.dto';

@Injectable()
export class AddPendingParticipantUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: AddPendingParticipantDTO) {
    if (!input.projectId || input.projectId <= 0) throw new ValidationError('projectId no es válido');
    // validar email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) throw new ValidationError('El formato del correo no es válido');
    // validar que hay studentCode
    if (!input.studentCode || input.studentCode.trim().length === 0) {
      throw new ValidationError('studentCode es obligatorio');
    }
    if (!input.semester || input.semester.trim().length === 0) {
      throw new ValidationError('semester es obligatorio');
    }
    if (!input.career || input.career.trim().length === 0) {
      throw new ValidationError('career es obligatorio');
    }
    const p = await this.repo.findById(input.projectId);
    if (!p) throw new NotFoundError('No se encontró el proyecto');
    
    // Crea o actualiza (upsert) el pending participante
    return this.repo.addPendingParticipant({
      projectId: input.projectId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        studentCode: input.studentCode,
        semester: input.semester.trim(),
        career: input.career.trim(),
        status: input.status || 'PENDING',
    });
  }
}
