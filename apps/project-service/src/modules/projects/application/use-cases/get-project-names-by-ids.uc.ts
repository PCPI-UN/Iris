import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ValidationError } from '../../domain/errors';
import { MAX_PROJECT_NAME_IDS } from '@app/common/constants/projects';

/**
 * Names of the given projects in one query, for public listings that only show the
 * project name (winners page). Ids that do not exist are left out; the caller decides
 * what to do with them.
 */
@Injectable()
export class GetProjectNamesByIdsUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
  ) {}

  async execute(input: { ids?: number[] }): Promise<{ id: number; name: string }[]> {
    // gRPC omits empty repeated fields, so the list may arrive undefined
    const ids = [...new Set(input.ids ?? [])];
    if (!ids.length) return [];
    if (ids.length > MAX_PROJECT_NAME_IDS) {
      throw new ValidationError(
        `Se pueden consultar como máximo ${MAX_PROJECT_NAME_IDS} proyectos a la vez`,
      );
    }
    if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
      throw new ValidationError('Los ids de proyecto deben ser enteros positivos');
    }

    return this.repo.findNamesByIds(ids);
  }
}
