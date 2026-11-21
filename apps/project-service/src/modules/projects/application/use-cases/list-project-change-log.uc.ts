import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import { ProjectChangeLogEntry } from '../../domain/entities/project-change-log.entity';
import { NotFoundError } from '../../domain/errors';

@Injectable()
export class ListProjectChangeLogUC {
  constructor(
    @Inject('ProjectRepository') private readonly projects: ProjectRepository,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
  ) {}

  /** Administrative changes of the project, most recent first. */
  async execute(projectId: number): Promise<ProjectChangeLogEntry[]> {
    const project = await this.projects.findById(projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');
    return this.changeLog.listByProject(projectId);
  }
}
