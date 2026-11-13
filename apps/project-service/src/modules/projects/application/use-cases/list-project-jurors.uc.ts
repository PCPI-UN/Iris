import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ListProjectJurorsDTO } from '../dto/list-project-jurors.dto';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class ListProjectJurorsUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: ListProjectJurorsDTO) {
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');
    return this.repo.listAssignments(input.projectId); // devuelve JurorKey[]
  }
}
