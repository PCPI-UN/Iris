import { Injectable } from '@nestjs/common';
import { EvaluationRepositoryPort } from '../../domain/repositories/evaluation.repository.port';
import {
  ComponentStats,
  buildCriteriaStats,
} from '../../domain/services/criteria-stats';
import { GetEventCriteriaStatsDto } from '../dto/get-event-criteria-stats.dto';
import { EventGradingScaleResolver } from '../../../grading-scales/application/event-grading-scale.resolver';

export interface EventCriteriaStats {
  /** Points of the highest level of the event's grading scale */
  maxScore: number;
  components: ComponentStats[];
}

/**
 * Average score of each rubric component over the given projects of an event (see
 * buildCriteriaStats). The gateway chooses the projects (all of the event or one category)
 * and checks who asks.
 */
@Injectable()
export class GetEventCriteriaStatsUseCase {
  constructor(
    private readonly evaluationRepository: EvaluationRepositoryPort,
    private readonly gradingScaleResolver: EventGradingScaleResolver,
  ) {}

  async execute(dto: GetEventCriteriaStatsDto): Promise<EventCriteriaStats> {
    const projectIds = dto.projectIds ?? [];

    const [scale, projects] = await Promise.all([
      this.gradingScaleResolver.resolve(dto.eventId),
      projectIds.length
        ? this.evaluationRepository.findEvaluationsForStats(projectIds)
        : Promise.resolve([]),
    ]);

    return {
      maxScore: Math.max(...scale.levels.map((level) => level.points)),
      components: buildCriteriaStats(projects, dto.withCriteria ?? false),
    };
  }
}
