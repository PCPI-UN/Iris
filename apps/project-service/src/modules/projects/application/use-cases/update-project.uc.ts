import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { UpdateProjectDTO } from '../dto/update-project.dto';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class UpdateProjectUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: UpdateProjectDTO) {
    const exists = await this.repo.findById(input.id);
    if (!exists) throw new NotFoundError('No se encontró el proyecto');

    // Si actualizas courseId/state podrías agregar políticas aquí
    return this.repo.updateProject(input);
  }
}
