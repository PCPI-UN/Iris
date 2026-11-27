import { Injectable } from '@nestjs/common';
import { EvaluationRepositoryPort } from '../../domain/repositories/evaluation.repository.port';
import {
  ComponentStats,
  StatsEvaluation,
  buildCriteriaStats,
} from '../../domain/services/criteria-stats';
import {
  ScoreBucket,
  finalGrade,
  scoreDistribution,
} from '../../domain/services/score-distribution';
import { GetEventCriteriaStatsDto } from '../dto/get-event-criteria-stats.dto';
import { GradingScaleRepositoryPort } from '../../../grading-scales/domain/grading-scale.repository.port';

/** Stats of one set of projects; only the ones with evaluations count */
export interface ProjectSetStats {
  evaluatedCount: number;
  components: ComponentStats[];
  /** Empty when the event has no grading scale */
  distribution: ScoreBucket[];
}

export interface EventCriteriaStats extends ProjectSetStats {
  /** Points of the highest level of the event's grading scale; absent when the event has none */
  maxScore?: number;
  /** One per requested group, in the same order */
  groups: ProjectSetStats[];
}

/**
 * Average score of each rubric component and its criteria over the given projects of an
 * event (see buildCriteriaStats) and how their final grades spread from 0 to the top of
 * the event's grading scale; the same for each optional group of projects, with a single
 * read of the evaluations. The gateway chooses the projects (all of the event, one
 * category, one project or an academic scope with its departments) and checks who asks.
 * The averages come from the stored weights, so an event without a grading scale still
 * gets them, only without maxScore and distribution.
 */
@Injectable()
export class GetEventCriteriaStatsUseCase {
  constructor(
    private readonly evaluationRepository: EvaluationRepositoryPort,
    private readonly gradingScales: GradingScaleRepositoryPort,
  ) {}

  async execute(dto: GetEventCriteriaStatsDto): Promise<EventCriteriaStats> {
    const projectIds = dto.projectIds ?? [];
    const groups = (dto.groups ?? []).map((group) => group.projectIds ?? []);
    const allIds = [...new Set([...projectIds, ...groups.flat()])];

    const [scale, evaluationsByProject] = await Promise.all([
      this.gradingScales.findEventScale(dto.eventId),
      allIds.length
        ? this.evaluationRepository.findEvaluationsForStats(allIds)
        : Promise.resolve(new Map<number, StatsEvaluation[]>()),
    ]);
    const maxScore = scale
      ? Math.max(...scale.levels.map((level) => level.points))
      : undefined;

    const statsOf = (ids: number[]): ProjectSetStats => {
      const projects = [...new Set(ids)].flatMap((id) => {
        const evaluations = evaluationsByProject.get(id);
        return evaluations?.length ? [evaluations] : [];
      });
      return {
        evaluatedCount: projects.length,
        components: buildCriteriaStats(projects),
        distribution: scoreDistribution(projects.map(finalGrade), maxScore),
      };
    };

    return {
      ...(maxScore !== undefined && { maxScore }),
      ...statsOf(projectIds),
      groups: groups.map(statsOf),
    };
  }
}
