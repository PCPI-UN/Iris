import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError } from '../../domain/errors';
import { JurorKey, JUROR_ROLE_ID } from '../../domain/entities/project.entity';
import { RemoveJurorFromProjectDTO } from '../dto/remove-juror-from-project.dto';

@Injectable()
export class RemoveJurorFromProjectUC {
  constructor(
    @Inject('ProjectRepository')
    private readonly repo: ProjectRepository,
  ) {}

  async execute(input: RemoveJurorFromProjectDTO) {
    const { projectId, userId } = input;

    const project = await this.repo.findById(projectId);
    if (!project) {
      throw new NotFoundError('No se encontró el proyecto');
    }

    const juror: JurorKey = {
      memberUserId: userId,
      memberEventId: project.eventId,
      memberRoleId: JUROR_ROLE_ID,
    };

    const removed = await this.repo.removeAssignment(projectId, juror);
    if (!removed) {
      throw new NotFoundError('No se encontró la asignación del jurado');
    }

    return {
      ok: true,
      projectId,
      userId,
      message: 'Jurado quitado del proyecto correctamente',
    };
  }
}
