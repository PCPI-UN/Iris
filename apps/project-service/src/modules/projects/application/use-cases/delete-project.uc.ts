import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { DeleteProjectDTO } from '../dto/delete-project.dto';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class DeleteProjectUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: DeleteProjectDTO) {
    
    const exists = await this.repo.findById(input.id);
    if (!exists) throw new NotFoundError('No se encontró el proyecto');

    await this.repo.delete(input.id);
    // el controller gRPC puede devolver { ok: true }
  }
}
