import { Injectable, Inject } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { normalizeEmail } from '@app/common/utils/email.util';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { AddProjectTutorDTO } from '../dto/add-project-tutor.dto';

/** Links a tutor who accepted a PROJECT_TUTOR invitation; the invitation must match a pending tutor of the project. */
@Injectable()
export class AddProjectTutorUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: AddProjectTutorDTO): Promise<{ success: boolean }> {
    if (!input.projectId || input.projectId <= 0) throw new ValidationError('projectId no es válido');
    if (!input.userId || input.userId <= 0) throw new ValidationError('userId no es válido');
    const email = normalizeEmail(input.email ?? '');
    if (!isEmail(email)) throw new ValidationError('El formato del correo no es válido');

    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    const pendings = await this.repo.listPendingTutors(input.projectId);
    const invited = pendings.some((pending) => pending.email === email && pending.status !== 'JOINED');
    if (!invited) {
      // A retried acceptance finds the tutor already linked; a removed tutor finds nothing
      const linked = await this.repo.listTutorUserIds(input.projectId);
      if (linked.includes(input.userId)) return { success: true };
      throw new ValidationError('El proyecto no tiene un tutor pendiente con este correo');
    }

    await this.repo.addTutor(input.projectId, input.userId);
    await this.repo.markPendingTutorJoined(input.projectId, email, new Date());
    return { success: true };
  }
}
