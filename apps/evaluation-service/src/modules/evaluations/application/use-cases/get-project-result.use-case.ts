import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { EvaluationRepositoryPort } from '../../domain/repositories/evaluation.repository.port';
import { ProjectServicePort } from '../../infrastructure/ports/project.service.port';
import {
  ProjectResult,
  buildProjectResult,
} from '../../domain/services/project-result';
import { GetProjectResultDto } from '../dto/get-project-result.dto';
import { EventGradingScaleResolver } from '../../../grading-scales/application/event-grading-scale.resolver';

export interface ProjectResultWithScale extends ProjectResult {
  maxScore: number;
}

/**
 * Consolidated result of a project for its participants (see buildProjectResult).
 * `maxScore` is the points of the highest level of the event's grading scale, which is also
 * the highest grade, since the effective weights add up to 1.
 *
 * It does not check whether the results are published nor who asks: the gateway does.
 */
@Injectable()
export class GetProjectResultUseCase {
  constructor(
    private readonly evaluationRepository: EvaluationRepositoryPort,
    private readonly projectService: ProjectServicePort,
    private readonly gradingScaleResolver: EventGradingScaleResolver,
  ) {}

  async execute(dto: GetProjectResultDto): Promise<ProjectResultWithScale> {
    const project = await this.projectService.getProject(dto.projectId);
    if (!project) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el proyecto con ID ${dto.projectId}`,
      });
    }

    const [scale, evaluations] = await Promise.all([
      this.gradingScaleResolver.resolve(project.eventId),
      this.evaluationRepository.findProjectEvaluationsForResult(dto.projectId),
    ]);

    const maxScore = Math.max(...scale.levels.map((level) => level.points));

    return { ...buildProjectResult(evaluations), maxScore };
  }
}
