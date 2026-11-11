import { Injectable } from '@nestjs/common';
import { AwardWinnerRepository } from '../../domain/repositories/award-winner.repository';
import { ProjectAward } from '../../domain/entities/project-award.entity';
import { ListAwardsByProjectsDTO } from '../dto/list-awards-by-projects.dto';

/**
 * Awards won by the given projects. Used by the student dashboard (IRIS-V3-STD-01) to
 * count and list the student's awards; co-winners are returned as one row each.
 */
@Injectable()
export class ListAwardsByProjectsUC {
  constructor(private readonly repo: AwardWinnerRepository) {}

  async execute(input: ListAwardsByProjectsDTO): Promise<ProjectAward[]> {
    const projectIds = [...new Set(input.projectIds ?? [])];
    if (!projectIds.length) return [];

    return this.repo.findByProjectIds(projectIds);
  }
}
