import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { Project } from '../../domain/entities/project.entity';
import { ValidationError } from '../../domain/errors';
import { MAX_LIST_PROJECTS_BY_IDS } from '@app/common/constants/projects';

/**
 * Projects by id in one query. Ids that do not exist are left out; the caller decides
 * what to do with them.
 */
@Injectable()
export class ListProjectsByIdsUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
  ) {}

  async execute(input: { ids?: number[] }): Promise<Project[]> {
    // gRPC omits empty repeated fields, so the list may arrive undefined
    const ids = [...new Set(input.ids ?? [])];
    if (!ids.length) return [];
    if (ids.length > MAX_LIST_PROJECTS_BY_IDS) {
      throw new ValidationError(
        `Se pueden consultar como máximo ${MAX_LIST_PROJECTS_BY_IDS} proyectos a la vez`,
      );
    }
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new ValidationError('Los ids de proyecto deben ser enteros positivos');
    }

    return this.repo.findManyByIds(ids);
  }
}
