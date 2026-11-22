import { Injectable, Inject } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  UpdateProjectDTO,
  UpdateProjectExpected,
} from '../dto/update-project.dto';
import { NotFoundError } from '../../domain/errors';

/**
 * Writes the basic data and the category of a project. The state is not editable here: it only
 * changes through the review use cases and AdminChangeProjectStateUC.
 */
@Injectable()
export class UpdateProjectUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
  ) {}

  /** With ifCurrent, writes only if those fields still hold those values (else ProjectChangedMeanwhileError) */
  async execute(input: UpdateProjectDTO, ifCurrent?: UpdateProjectExpected) {
    const exists = await this.repo.findById(input.id);
    if (!exists) throw new NotFoundError('No se encontró el proyecto');

    return this.repo.updateProject(
      {
        id: input.id,
        name: input.name,
        projectCode: input.projectCode,
        description: input.description,
        eventNumber: input.eventNumber,
        courseId: input.courseId,
      },
      ifCurrent,
    );
  }
}
