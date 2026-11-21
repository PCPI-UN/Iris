import { Injectable } from '@nestjs/common';
import {
    EvaluationRepositoryPort,
    ProjectEvaluationStatus,
    EvaluationWithDetails
} from '../../domain/repositories/evaluation.repository.port';
import { CheckEvaluationStatusDto } from '../dto/check-evaluation-status.dto';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EventGradingScaleResolver } from '../../../grading-scales/application/event-grading-scale.resolver';
import { ScaleScorer } from '../../../grading-scales/domain/scale-scorer';

@Injectable()
export class CheckEvaluationStatusUseCase {
    constructor(
        private readonly evaluationRepository: EvaluationRepositoryPort,
        private readonly gradingScaleResolver: EventGradingScaleResolver,
    ) {}

  async execute(
    dto: CheckEvaluationStatusDto,
  ): Promise<ProjectEvaluationStatus[]> {
    const { projectIds, userId, eventId } = dto;

    // Stored scores are points of the event's grading scale; the juror sees them as levels again
    const scorer = new ScaleScorer(await this.gradingScaleResolver.resolve(eventId));
    const toLevel = (points: number): number => {
      const level = scorer.levelFor(points);
      if (level === undefined) {
        throw new RpcException({
          code: status.INTERNAL,
          message: `Stored score ${points} is not a value of the grading scale "${scorer.scale.name}" of event ${eventId}`,
        });
      }
      return level;
    };

    // Fetch all evaluations for these projects by this evaluator
    const evaluations =
      await this.evaluationRepository.findByProjectIdsAndEvaluator(
        projectIds,
        userId,
        eventId,
      );

    // Create a map for quick lookup
    const evaluationMap = new Map<number, EvaluationWithDetails>(
      evaluations.map((item: any) => [item.evaluation.projectId, item]),
    );

    // Build response for all requested projects
    return projectIds.map((projectId: number) => {
      const evalData = evaluationMap.get(projectId);

      if (!evalData) {
        return {
          projectId,
          evaluated: false,
        };
      }

      // Reverse-map scores from stored values back to original
      const reverseMappedScores = evalData.scores.map((score: any) => ({
        evaluationId: score.evaluationId,
        criterionId: score.criterionId,
        score: toLevel(score.score),
        weight: score.weight,
      }));

      return {
        projectId,
        evaluated: true,
        evaluation: {
          evaluation: evalData.evaluation,
          scores: reverseMappedScores,
        },
      };
    });
  }
}
