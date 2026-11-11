import { ProjectAward } from '../entities/project-award.entity';

export abstract class AwardWinnerRepository {
  /** Awards won by the given projects, ordered by event, category and award position. */
  abstract findByProjectIds(projectIds: number[]): Promise<ProjectAward[]>;
}
