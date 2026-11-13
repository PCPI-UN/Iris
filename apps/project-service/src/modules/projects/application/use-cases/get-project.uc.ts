import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { GetProjectDTO } from '../dto/get-project.dto';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class GetProjectUC {
  constructor(@Inject('ProjectRepository') private readonly repo: ProjectRepository) {}

  async execute(input: GetProjectDTO) {
    const project = await this.repo.findById(input.id);
    if (!project) throw new NotFoundError('No se encontró el proyecto');
    return project;
  }
}
