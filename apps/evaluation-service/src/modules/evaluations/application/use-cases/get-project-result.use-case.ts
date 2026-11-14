import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EvaluationRepositoryPort } from '../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../infrastructure/ports/project.service.port';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';
import {
  ProjectResult,
  buildProjectResult,
} from '../../domain/services/project-result';
import { ScoreMapperFactory } from '../mappers/score-mapper.factory';
import { resolveEvaluationType } from '../evaluation-type.resolver';
import { GetProjectResultDto } from '../dto/get-project-result.dto';

/** Highest raw score a juror can give; every evaluation type maps 1 to 4 */
const HIGHEST_RAW_SCORE = 4;

export interface ProjectResultWithScale extends ProjectResult {
  maxScore: number;
}

/**
 * Consolidated result of a project for its participants (see buildProjectResult).
 * `maxScore` is the stored value of the highest raw score in the event's evaluation type,
 * which is also the highest grade, since the effective weights add up to 1.
 *
 * It does not check whether the results are published nor who asks: the gateway does.
 */
@Injectable()
export class GetProjectResultUseCase {
  constructor(
    private readonly evaluationRepository: EvaluationRepositoryPort,
    private readonly projectService: ProjectServicePort,
    private readonly eventService: EventServicePort,
  ) {}

  async execute(dto: GetProjectResultDto): Promise<ProjectResultWithScale> {
    const project = await this.projectService.getProject(dto.projectId);
    if (!project) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `Project ${dto.projectId} not found`,
      });
    }

    const [event, evaluations] = await Promise.all([
      this.eventService.getEvent(project.eventId),
      this.evaluationRepository.findProjectEvaluationsForResult(dto.projectId),
    ]);

    const evaluationType = resolveEvaluationType(event?.evaluationType);
    const maxScore = ScoreMapperFactory.create(evaluationType).map(
      HIGHEST_RAW_SCORE,
      evaluationType,
    );

    return { ...buildProjectResult(evaluations), maxScore };
  }
}
