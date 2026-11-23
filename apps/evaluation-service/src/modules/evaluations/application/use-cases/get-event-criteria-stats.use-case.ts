import { Injectable } from '@nestjs/common';
import { EvaluationRepositoryPort } from '../../domain/repositories/evaluation.repository.port';
import {
  ComponentStats,
  buildCriteriaStats,
} from '../../domain/services/criteria-stats';
import { GetEventCriteriaStatsDto } from '../dto/get-event-criteria-stats.dto';
import { GradingScaleRepositoryPort } from '../../../grading-scales/domain/grading-scale.repository.port';

export interface EventCriteriaStats {
  /** Points of the highest level of the event's grading scale; absent when the event has none */
  maxScore?: number;
  components: ComponentStats[];
}

/**
 * Average score of each rubric component and its criteria over the given projects of an
 * event (see buildCriteriaStats). The gateway chooses the projects (all of the event, one
 * category or one project) and checks who asks. The averages come from the stored weights,
 * so an event without a grading scale still gets them, only without maxScore.
 */
@Injectable()
export class GetEventCriteriaStatsUseCase {
  constructor(
    private readonly evaluationRepository: EvaluationRepositoryPort,
    private readonly gradingScales: GradingScaleRepositoryPort,
  ) {}

  async execute(dto: GetEventCriteriaStatsDto): Promise<EventCriteriaStats> {
    const projectIds = dto.projectIds ?? [];

    const [scale, projects] = await Promise.all([
      this.gradingScales.findEventScale(dto.eventId),
      projectIds.length
        ? this.evaluationRepository.findEvaluationsForStats(projectIds)
        : Promise.resolve([]),
    ]);

    return {
      ...(scale && {
        maxScore: Math.max(...scale.levels.map((level) => level.points)),
      }),
      components: buildCriteriaStats(projects),
    };
  }
}
