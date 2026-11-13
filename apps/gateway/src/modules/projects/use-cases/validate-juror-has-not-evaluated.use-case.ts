import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
} from '@app/common/generated/project';
import {
  EVALUATION_SERVICE_NAME,
  EvaluationServiceClient,
} from '@app/common/generated/evaluation';
import { JurorEvaluationCheckResult } from '../types/juror-removal.types';

@Injectable()
export class ValidateJurorHasNotEvaluatedUseCase implements OnModuleInit {
  private readonly logger = new Logger(
    ValidateJurorHasNotEvaluatedUseCase.name,
  );
  private projectsService: ProjectsServiceClient;
  private evaluationService: EvaluationServiceClient;

  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectsClient: ClientGrpc,
    @Inject(EVALUATION_SERVICE_NAME)
    private readonly evaluationClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.projectsService =
      this.projectsClient.getService<ProjectsServiceClient>(
        PROJECTS_SERVICE_NAME,
      );
    this.evaluationService =
      this.evaluationClient.getService<EvaluationServiceClient>(
        EVALUATION_SERVICE_NAME,
      );
  }

  async execute(
    projectId: number,
    jurorUserId: number,
  ): Promise<JurorEvaluationCheckResult> {
    const projectResponse = await lastValueFrom(
      this.projectsService.getProject({ id: projectId }),
    );

    if (!projectResponse.project) {
      throw new NotFoundException('No se encontró el proyecto');
    }

    const evaluationResponse = await lastValueFrom(
      this.evaluationService.checkEvaluationStatus({
        userId: jurorUserId,
        eventId: projectResponse.project.eventId,
        projectIds: [projectId],
      }),
    );

    const evaluated = evaluationResponse.projects?.[0]?.evaluated === true;
    this.logger.debug(
      `Evaluation check for project=${projectId} juror=${jurorUserId} evaluated=${evaluated}`,
    );

    if (evaluated) {
      throw new BadRequestException('El jurado ya ha evaluado este proyecto');
    }

    return { projectId, jurorUserId, evaluated: false };
  }
}
