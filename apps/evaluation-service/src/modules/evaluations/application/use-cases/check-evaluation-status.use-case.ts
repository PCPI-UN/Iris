import { Injectable } from '@nestjs/common';
import {
    EvaluationRepositoryPort,
    ProjectEvaluationStatus,
    EvaluationWithDetails
} from '../../domain/repositories/evaluation.repository.port';
import { CheckEvaluationStatusDto } from '../dto/check-evaluation-status.dto';
import { ScoreMapper } from '../../domain/ports/score-mapper.port';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';
import { ScoreMapperFactory } from '../mappers/score-mapper.factory';
import { EvaluationType } from '../../../../common/constants/evaluation-type.constants';
import { EvaluationType as EventEvaluationType } from '@app/common/generated/event';

@Injectable()
export class CheckEvaluationStatusUseCase {
    constructor(
        private readonly evaluationRepository: EvaluationRepositoryPort,
        private readonly eventService: EventServicePort,
    ) {}

    private resolveEvaluationType(evaluationType: unknown): EvaluationType {
        if (
            evaluationType === undefined ||
            evaluationType === null ||
            evaluationType === EventEvaluationType.EVALUATION_TYPE_UNSPECIFIED ||
            evaluationType === EventEvaluationType.FINAL_PROJECTS ||
            evaluationType === EvaluationType.FINAL_PROJECTS
        ) {
            return EvaluationType.FINAL_PROJECTS;
        }

        if (
            evaluationType === EventEvaluationType.ZERO_TO_FIVE ||
            evaluationType === EvaluationType.ZERO_TO_FIVE
        ) {
            return EvaluationType.ZERO_TO_FIVE;
        }

        if (
            evaluationType === EventEvaluationType.ZERO_TO_HUNDRED ||
            evaluationType === EvaluationType.ZERO_TO_HUNDRED
        ) {
            return EvaluationType.ZERO_TO_HUNDRED;
        }

        return EvaluationType.FINAL_PROJECTS;
    }

  async execute(
    dto: CheckEvaluationStatusDto,
  ): Promise<ProjectEvaluationStatus[]> {
    const { projectIds, userId, eventId } = dto;

    // Get event to determine evaluation type
    const event = await this.eventService.getEvent(eventId);
    const evaluationType = this.resolveEvaluationType(event.evaluationType);

    // Every evaluation type has its own mapper (ZERO_TO_HUNDRED used to get none and crashed here)
    const scoreMapper: ScoreMapper = ScoreMapperFactory.create(evaluationType);

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
        score: scoreMapper.toOriginalValue(score.score),
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
