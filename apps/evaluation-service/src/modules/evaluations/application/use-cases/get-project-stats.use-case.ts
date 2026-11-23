import { Injectable } from '@nestjs/common';
import {
  EvaluationRepositoryPort,
  ProjectStats,
} from '../../domain/repositories/evaluation.repository.port';
import {
  ComponentStats,
  buildCriteriaStats,
} from '../../domain/services/criteria-stats';
import { GetProjectStatsDto } from '../dto/get-project-stats.dto';
import { EventGradingScaleResolver } from '../../../grading-scales/application/event-grading-scale.resolver';

export interface ProjectStatsWithComponents extends Omit<
  ProjectStats,
  'eventId'
> {
  /** Average score per rubric component, with its criteria (see buildCriteriaStats) */
  components: ComponentStats[];
  /** Points of the highest level of the event's grading scale; 0 without evaluations */
  maxScore: number;
}

/**
 * Grade statistics of one project. The event comes from the criteria scored, not from
 * project-service, because project-service also calls this RPC to count evaluations.
 */
@Injectable()
export class GetProjectStatsUseCase {
  constructor(
    private readonly evaluationRepository: EvaluationRepositoryPort,
    private readonly gradingScaleResolver: EventGradingScaleResolver,
  ) {}

  async execute(dto: GetProjectStatsDto): Promise<ProjectStatsWithComponents> {
    const [{ eventId, ...stats }, projects] = await Promise.all([
      this.evaluationRepository.getProjectStats(dto.projectId),
      this.evaluationRepository.findEvaluationsForStats([dto.projectId]),
    ]);

    const maxScore =
      eventId === null
        ? 0
        : Math.max(
            ...(await this.gradingScaleResolver.resolve(eventId)).levels.map(
              (level) => level.points,
            ),
          );

    return {
      ...stats,
      components: buildCriteriaStats(projects, true),
      maxScore,
    };
  }
}
