import {
  ListAwardsByProjectsResponse,
  ProjectAwardProto,
} from '@app/common/generated/event';
import { ProjectAward } from '../../domain/entities/project-award.entity';

export class ProjectAwardMapper {
  static toProto(award: ProjectAward): ProjectAwardProto {
    return {
      winnerId: award.winnerId,
      projectId: award.projectId,
      awardId: award.awardId,
      title: award.title,
      position: award.position,
      categoryId: award.categoryId,
      categoryName: award.categoryName,
      eventId: award.eventId,
      resultsPublished: award.resultsPublished,
    };
  }

  static toListResponse(awards: ProjectAward[]): ListAwardsByProjectsResponse {
    return { awards: awards.map((award) => this.toProto(award)) };
  }
}
