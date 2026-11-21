import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ReassignProjectDTO } from '../dto/reassign-project.dto';
import { NotFoundError } from '../../domain/errors';
import { JurorKey, JUROR_ROLE_ID } from '../../domain/entities/project.entity';

@Injectable()
export class ReassignProjectJurorUC {
  constructor(
    @Inject('ProjectRepository')
    private readonly repo: ProjectRepository,
  ) {}

  async execute(input: ReassignProjectDTO) {
    const { projectId, fromUserId, toUserId } = input;

    // 1. Obtener el proyecto para saber el eventId
    const project = await this.repo.findById(projectId);
    if (!project) {
      throw new NotFoundError('No se encontró el proyecto');
    }

    const eventId = project.eventId;

    // 2. Si son el mismo usuario, nada que hacer
    if (fromUserId === toUserId) {
      return { ok: true, changed: false };
    }

    // 3. Construimos los JurorKey con el mismo rol que usa assign
    const fromJuror: JurorKey = {
      memberUserId: fromUserId,
      memberEventId: eventId,
      memberRoleId: JUROR_ROLE_ID,
    };

    const toJuror: JurorKey = {
      memberUserId: toUserId,
      memberEventId: eventId,
      memberRoleId: JUROR_ROLE_ID,
    };

    // 4. Quitamos el jurado anterior y asignamos el nuevo
    const removed = await this.repo.removeAssignment(projectId, fromJuror);
    await this.repo.upsertAssignment(projectId, toJuror);

    return { ok: true, changed: removed };
  }
}
