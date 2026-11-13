import { Injectable, Inject, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
  GetProjectRequest,
  UpdateProjectRequest,
  ProjectCompleteResponse,
  ProjectComplete,
  ProjectState,
  ProjectParticipant,
} from '@app/common/generated/project';

@Injectable()
export class UpdateProjectCodeUseCase {
  private readonly logger = new Logger(UpdateProjectCodeUseCase.name);
  private projectsService: ProjectsServiceClient;

  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectsClient: ClientGrpc,
  ) {
    this.projectsService = this.projectsClient.getService<ProjectsServiceClient>(
      PROJECTS_SERVICE_NAME,
    );
  }

  /**
   * Update a project's code after validating business rules
   */
  async execute(id: number, projectCode: string, actingUserId: number): Promise<void> {
    const request: GetProjectRequest = { id };

    const res: ProjectCompleteResponse = await lastValueFrom(
      this.projectsService.getProjectComplete(request),
    );

    const project: ProjectComplete | undefined = res.items?.[0];

    if (!project) {
      throw new NotFoundException('No se encontró el proyecto');
    }

    const projectStateLabel =
      typeof project.state === 'number'
        ? ProjectState[project.state]
        : project.state;
    const canUpdateCode =
      project.state === ProjectState.REQUEST_CHANGES ||
      projectStateLabel === 'REQUEST_CHANGES';

    if (!canUpdateCode) {
      throw new BadRequestException(
        `Solo se puede actualizar el código de un proyecto en estado REQUEST_CHANGES. Estado actual: ${projectStateLabel}`,
      );
    }

    const participants: ProjectParticipant[] = project.participants ?? [];

    // Note: pendingParticipants objects do not include a userId in the proto
    // so we only consider confirmed `participants` (those linked to a userId).
    const isParticipant = participants.some(
      (p: ProjectParticipant) => p.userId === actingUserId,
    );

    if (!isParticipant) {
      throw new ForbiddenException(
        'Solo los participantes del proyecto pueden actualizar su código',
      );
    }

    this.logger.log(`Updating project ${id} code to ${projectCode} by user ${actingUserId}`);

    const updateRequest: UpdateProjectRequest = {
      id,
      projectCode,
    };

    await lastValueFrom(this.projectsService.updateProject(updateRequest));
  }
}
