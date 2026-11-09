import {
  Injectable,
  Inject,
  OnModuleInit,
  BadRequestException,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import {
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
  ProjectState,
  ListProjectsByEventRequest,
  ListProjectsResponse,
  GetProjectRequest,
  ProjectCompleteResponse,
  TypedDocument as ProtoTypedDocument,
  ProjectComplete,
  UpdateProjectDocumentRequest,
  ProjectDocumentResponse,
  ProjectDocument,
  DocumentStatus,
  ListProjectJurorsRequest,
  ListProjectJurorsResponse,
  ListAssignedProjectsRequest,
  ListAssignedProjectsResponse,
  GetMyProjectByEventRequest,
  GetMyProjectByEventResponse,
  ListUserParticipationsResponse,
  AddPendingParticipantRequest,
  JurorKey,
} from '@app/common/generated/project';
import { CreateProjectWithParticipantsDto } from './dto/create-project-with-participants.dto';
import { CreateProjectWithParticipantsMultipartDto } from './dto/create-project-with-participants-multipart.dto';
import { AssignJurorToProjectsDto } from './dto/assign-juror-to-projects.dto';
import { ReassignProjectJurorDto } from './dto/reassign-project-juror.dto';
import { ApproveProjectDto } from './dto/approve-project.dto';
import { AddPendingParticipantDto } from './dto/add-pending-participant.dto';
import { RejectProjectDto } from './dto/reject-project.dto';
import {
  TypedDocument,
  ProjectDocumentInputDto,
} from './dto/project-document-input.dto';
import { AzureBlobUploadService } from './azure-blob-upload.service';
import { PendingParticipantInputDto } from './dto/pending-participant-input.dto';
import {
  ListProjectsByEventDto,
  ProjectStateFilter,
} from './dto/list-projects-by-event.dto';
import {
  UpdateProjectDocumentDto,
  DocumentStatusFilter,
} from './dto/update-project-document.dto';
import { AddProjectDocumentsMultipartDto } from './dto/add-project-files-multipart.dto';
import {
  EVENT_SERVICE_NAME,
  EventServiceClient,
} from '@app/common/generated/event';

import {
  EVALUATION_SERVICE_NAME,
  EvaluationServiceClient,
  CheckEvaluationStatusRequest,
  CheckEvaluationStatusResponse,
} from '@app/common/generated/evaluation';
import { ProjectForReviewResponseDto } from './dto/project-for-review-response.dto';
import { AuthService } from '../auth/auth.service';
import { FetchProjectJurorsUseCase } from './use-cases/fetch-project-jurors.use-case';
import { FetchUserProfilesUseCase } from './use-cases/fetch-user-profiles.use-case';
import { EnrichProjectsWithJurorsUseCase } from './use-cases/enrich-projects-with-jurors.use-case';
import { ValidateJurorHasNotEvaluatedUseCase } from './use-cases/validate-juror-has-not-evaluated.use-case';
import { RemoveJurorFromProjectUseCase } from './use-cases/remove-juror-from-project.use-case';
import { UpdateProjectCodeUseCase } from './use-cases/update-project-code.use-case';
import {
  ProjectWithEnrichedJurors,
  ListProjectsWithJurorsResponse,
} from './types/project-enrichment.types';
import { RemoveJurorFromProjectDto } from './dto/remove-juror-from-project.dto';
import { JurorRemovalResult } from './types/juror-removal.types';

export type {
  JurorProfile,
  ProjectWithEnrichedJurors,
} from './types/project-enrichment.types';

@Injectable()
export class ProjectsService implements OnModuleInit {
  private readonly logger = new Logger(ProjectsService.name);
  private projectsService: ProjectsServiceClient;
  private eventsService: EventServiceClient;
  private evaluationService: EvaluationServiceClient;
  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectsClient: ClientGrpc,
    @Inject(EVENT_SERVICE_NAME) private readonly eventsClient: ClientGrpc,
    @Inject(EVALUATION_SERVICE_NAME)
    private readonly evaluationClient: ClientGrpc,
    private readonly azureBlobUploadService: AzureBlobUploadService,
    private readonly authService: AuthService,
    private readonly fetchProjectJurorsUseCase: FetchProjectJurorsUseCase,
    private readonly fetchUserProfilesUseCase: FetchUserProfilesUseCase,
    private readonly enrichProjectsWithJurorsUseCase: EnrichProjectsWithJurorsUseCase,
    private readonly validateJurorHasNotEvaluatedUseCase: ValidateJurorHasNotEvaluatedUseCase,
    private readonly removeJurorFromProjectUseCase: RemoveJurorFromProjectUseCase,
    private readonly updateProjectCodeUseCase: UpdateProjectCodeUseCase,
  ) {}

  onModuleInit() {
    this.projectsService =
      this.projectsClient.getService<ProjectsServiceClient>(
        PROJECTS_SERVICE_NAME,
      );

    this.eventsService =
      this.eventsClient.getService<EventServiceClient>(EVENT_SERVICE_NAME);

    this.evaluationService =
      this.evaluationClient.getService<EvaluationServiceClient>(
        EVALUATION_SERVICE_NAME,
      );
  }

  /**
   * Creates a project with participants and file uploads
   */
  async createProjectWithParticipantsAndFiles(
    body: CreateProjectWithParticipantsMultipartDto,
    files: any[],
  ) {
    this.logger.log(
      `Creating project with ${files.length} files: ${body.name}`,
    );

    const eventType = body.eventType;
    if (eventType !== 'Competition' && eventType !== 'Exposition') {
      throw new BadRequestException(
        'Invalid event type. Must be "Competition" or "Exposition".',
      );
    }

    let participants: PendingParticipantInputDto[] = [];
    if (body.participants) {
      try {
        participants = JSON.parse(body.participants);
      } catch (error: any) {
        throw new BadRequestException(
          'Invalid participants format. Must be a valid JSON array.',
        );
      }
    }

    let documentMetadata: ProjectDocumentInputDto[] = [];
    if (body.documents) {
      try {
        documentMetadata = JSON.parse(body.documents);
      } catch (error: any) {
        throw new BadRequestException(
          'Invalid documents format. Must be a valid JSON array.',
        );
      }
    }

    if (files.length !== documentMetadata.length) {
      throw new BadRequestException(
        `Number of files (${files.length}) does not match number of document metadata entries (${documentMetadata.length})`,
      );
    }

    // Validate that all document types are valid
    const validTypes = Object.values(TypedDocument);
    const invalidDocs = documentMetadata.filter(
      (doc) => !validTypes.includes(doc.type),
    );
    if (invalidDocs.length > 0) {
      const invalidTypes = invalidDocs.map((doc) => doc.type).join(', ');
      throw new BadRequestException(
        `Invalid document type(s): ${invalidTypes}. Valid types are: ${validTypes.join(', ')}`,
      );
    }

    // Validate maximum file count (1 logo + 1 poster + 2 supporting docs = 4 max)
    if (files.length > 4) {
      throw new BadRequestException(
        'Maximum 4 files allowed: 1 logo, 1 poster, and 2 supporting documents',
      );
    }

    // Validate file sizes (25MB max per file)
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
    const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map((f) => f.originalname).join(', ');
      throw new BadRequestException(
        `Files exceed 25MB limit: ${fileNames}. Maximum file size is 25MB per file.`,
      );
    }

    // Validate document type distribution
    // Count each document type
    const typeCounts = documentMetadata.reduce(
      (acc, doc) => {
        acc[doc.type] = (acc[doc.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Validate: max 1 logo, 1 poster, 2 supporting documents
    if (typeCounts['LOGO'] > 1) {
      throw new BadRequestException('Only 1 logo file is allowed');
    }
    if (typeCounts['POSTER'] > 1) {
      throw new BadRequestException('Only 1 poster file is allowed');
    }
    if (typeCounts['SUPPORTING_DOCUMENT'] > 2) {
      throw new BadRequestException(
        'Maximum 2 supporting document files are allowed',
      );
    }

    const eventId = parseInt(body.eventId, 10);
    const courseId = parseInt(body.courseId, 10);

    if (isNaN(eventId) || isNaN(courseId)) {
      throw new BadRequestException(
        'eventId and courseId must be valid numbers',
      );
    }

    // Here we create a project WITHOUT documents
    // This ensures we don't upload files if project creation fails
    this.logger.log('Step 1: Creating project without documents');
    let createdProject;
    try {
      const response = await firstValueFrom(
        this.projectsService.createProjectWithPendingParticipants({
          eventId,
          eventType,
          courseId,
          name: body.name,
          description: body.description,
          projectCode: body.projectCode,
          participants: participants.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            studentCode: p.studentCode,
            semester: p.semester,
            career: p.career,
          })),
          documents: [], // We'll add documents after upload
        }),
      );
      createdProject = response.project;
      if (!createdProject) {
        throw new BadRequestException('Project creation returned no project');
      }
      this.logger.log(
        `Project created successfully with ID: ${createdProject.id}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to create project: ${error.message}`,
        error.stack,
      );
      throw error;
    }

    this.logger.log(
      `Step 2: Uploading ${files.length} files to Azure Blob Storage (project creation succeeded)`,
    );
    let uploadResults;
    try {
      const uploadPromises = files.map((file) =>
        this.azureBlobUploadService.uploadFile(file),
      );
      uploadResults = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${uploadResults.length} files`);
    } catch (error: any) {
      this.logger.error(
        `Failed to upload files to Azure: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Project created but failed to upload files: ${error.message}`,
      );
    }

    this.logger.log('Step 3: Attaching documents to project');
    try {
      const addDocumentPromises = uploadResults.map((uploadResult, index) =>
        firstValueFrom(
          this.projectsService.addProjectDocumentFromUrl({
            projectId: createdProject.id,
            url: uploadResult.blobName,
            type: this.mapDocumentTypeToProto(documentMetadata[index].type),
          }),
        ),
      );
      await Promise.all(addDocumentPromises);
      this.logger.log(
        `Successfully attached ${uploadResults.length} documents to project ${createdProject.id}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to attach documents to project: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Project created and files uploaded, but failed to attach documents: ${error.message}`,
      );
    }

    // Return the created project
    return { message: 'Project submitted successfully', success: true };
  }

  async createProjectWithParticipants(dto: CreateProjectWithParticipantsDto) {
    const response = await firstValueFrom(
      this.projectsService.createProjectWithPendingParticipants({
        eventId: dto.eventId,
        eventType: dto.eventType,
        courseId: dto.courseId,
        name: dto.name,
        description: dto.description,
        projectCode: dto.projectCode,
        participants:
          dto.participants?.map((p) => ({
            firstName: p.firstName,
            lastName: p.lastName,
            email: p.email,
            studentCode: p.studentCode,
            semester: p.semester,
            career: p.career,
          })) ?? [],
        documents:
          dto.documents?.map((d) => ({
            url: this.azureBlobUploadService.toStoredUrl(d.url),
            type: this.mapDocumentTypeToProto(d.type),
          })) ?? [],
      }),
    );

    return response;
  }

  async addPendingParticipant(dto: AddPendingParticipantDto) {
    const request: AddPendingParticipantRequest = {
      projectId: dto.projectId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      studentCode: dto.studentCode,
      semester: dto.semester ?? '',
      career: dto.career ?? '',
      status: dto.status ?? 1,
    };

    return firstValueFrom(
      this.projectsService.addPendingParticipant(request),
    );
  }

  async assignJurorToProjects(dto: AssignJurorToProjectsDto) {
    const response = await firstValueFrom(
      this.projectsService.assignJurorToProjects({
        userId: dto.userId,
        projectIds: dto.projectIds,
      }),
    );

    return response;
  }

  async reassignProjectJuror(dto: ReassignProjectJurorDto) {
    const response = await firstValueFrom(
      this.projectsService.reassignProjectJuror({
        projectId: dto.projectId,
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId,
      }),
    );

    return response;
  }

  async removeJurorFromProject(
    dto: RemoveJurorFromProjectDto,
  ): Promise<JurorRemovalResult> {
    return this.removeJurorFromProjectUseCase.execute(dto);
  }

  async approveProject(dto: {id: number; eventType: string}, actingUserId: number) {
    const response = await firstValueFrom(
      this.projectsService.approveProject({
        id: dto.id,
        actingUserId: actingUserId,
        eventType: dto.eventType,
      }),
    );

    return response;
  }

  async rejectProject(
    dto: { id: number; reason?: string; eventType: string },
    actingUserId: number,
  ) {
    const response = await firstValueFrom(
      this.projectsService.rejectProject({
        id: dto.id,
        actingUserId,
        reason: dto.reason,
        eventType: dto.eventType,
      }),
    );

    return response;
  }

  async requestChangesProject(
    dto: { id: number; reason: string },
    actingUserId: number,
  ) {
    const response = await firstValueFrom(
      this.projectsService.requestChangesProject({
        id: dto.id,
        actingUserId,
        reason: dto.reason,
      }),
    );

    return response;
  }

  async changeToUnderReviewProject(projectId: number, actingUserId: number) {
    return firstValueFrom(
      this.projectsService.changeToUnderReviewProject({
        id: projectId,
        actingUserId: actingUserId,
      }),
    );
  }

  // Helper method to convert DTO TypedDocument to Proto TypedDocument
  private mapDocumentTypeToProto(type: TypedDocument): ProtoTypedDocument {
    const mapping = {
      [TypedDocument.LOGO]: ProtoTypedDocument.LOGO,
      [TypedDocument.POSTER]: ProtoTypedDocument.POSTER,
      [TypedDocument.SUPPORTING_DOCUMENT]:
        ProtoTypedDocument.SUPPORTING_DOCUMENT,
    };
    return mapping[type];
  }

  private mapStateToProto(
    state?: ProjectStateFilter,
  ): ProjectState | undefined {
    switch (state) {
      case ProjectStateFilter.UNDER_REVIEW:
        return ProjectState.UNDER_REVIEW;
      case ProjectStateFilter.APPROVED:
        return ProjectState.APPROVED;
      case ProjectStateFilter.REJECTED:
        return ProjectState.REJECTED;
      case ProjectStateFilter.REQUEST_CHANGES:
        return ProjectState.REQUEST_CHANGES;
      default:
        return undefined;
    }
  }

  async listProjectsByEvent(
    eventId: number,
    query: ListProjectsByEventDto,
  ): Promise<ListProjectsResponse> {
    const request: ListProjectsByEventRequest = {
      eventId,
      q: query.q ?? undefined,
      courseId: query.courseId ?? undefined,
      currentPage: query.currentPage ?? 1,
      itemsPerPage: query.itemsPerPage ?? 20,
      state: this.mapStateToProto(query.state),
    };

    return lastValueFrom(this.projectsService.listProjectsByEvent(request));
  }

  async listProjectsByEventWithJurors(
    eventId: number,
    query: ListProjectsByEventDto,
  ): Promise<ListProjectsWithJurorsResponse> {
    const res = await this.listProjectsByEvent(eventId, query);
    const page = query.currentPage ?? 1;
    const limit = query.itemsPerPage ?? 20;

    return this.enrichProjectsWithJurorsUseCase.execute(
      res.items,
      page,
      limit,
      res.total,
      res.totalPages,
      {
        userProfileConcurrencyLimit: 5,
      },
    );
  }

  async getDashboardStats() {
    return firstValueFrom(this.projectsService.getDashboardStats({}));
  }

  async getProjectForReview(id: number): Promise<ProjectForReviewResponseDto> {
    const project = await this.getProjectById(id);

    const { participants, pendingParticipants, documents, ...projectInfo } =
      project;

    return {
      confirmedParticipants: participants,
      pendingParticipants,
      project: projectInfo,
      documents,
    };
  }

  async getProjectById(id: number): Promise<ProjectComplete> {
    const request: GetProjectRequest = { id };

    const res: ProjectCompleteResponse = await lastValueFrom(
      this.projectsService.getProjectComplete(request),
    );

    const project = res.items[0];

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private mapDocumentStatusToProto(
    state: DocumentStatusFilter,
  ): DocumentStatus | undefined {
    switch (state) {
      case DocumentStatusFilter.ACTIVE:
        return DocumentStatus.ACTIVE;
      case DocumentStatusFilter.INACTIVE:
        return DocumentStatus.INACTIVE;
      default:
        return DocumentStatus.DOCUMENT_STATUS_UNSPECIFIED;
    }
  }

  /**
   * Freshly signed URL of a project document's file, for the stable
   * `/projects/:projectId/documents/:documentId/open` link.
   */
  async getDocumentOpenUrl(
    projectId: number,
    documentId: number,
  ): Promise<string> {
    const { items } = await lastValueFrom(
      this.projectsService.listProjectDocuments({ projectId }),
    );
    const document = items?.find((item) => item.id === documentId);
    if (!document) {
      throw new NotFoundException('Project document not found');
    }

    const url = this.azureBlobUploadService.openUrl(document.url);
    if (!url) {
      throw new NotFoundException('Project document has no stored file');
    }
    return url;
  }

  async updateProjectDocument(
    id: number,
    dto: UpdateProjectDocumentDto,
    file?: any,
  ): Promise<ProjectDocument> {
    const request: UpdateProjectDocumentRequest = { id };

    if (file) {
      const uploadResult = await this.azureBlobUploadService.uploadFile(file);
      request.url = uploadResult.blobName;
    } else if (dto.url && dto.url.trim() !== '') {
      request.url = this.azureBlobUploadService.toStoredUrl(dto.url.trim());
    }
    if (dto.type !== undefined) {
      request.type = this.mapDocumentTypeToProto(dto.type);
    }
    if (dto.state !== undefined) {
      request.state = this.mapDocumentStatusToProto(dto.state);
    }

    const res: ProjectDocumentResponse = await lastValueFrom(
      this.projectsService.updateProjectDocument(request),
    );

    if (!res.document) {
      throw new NotFoundException('Project document not found');
    }

    return res.document;
  }

  async updateProjectInfo(
    id: number,
    name?: string,
    description?: string,
  ): Promise<void> {
    await firstValueFrom(
      this.projectsService.updateProject({
        id,
        name,
        description,
      }),
    );
  }

  async updateProjectCode(
    id: number,
    projectCode: string,
    userId: number,
  ): Promise<void> {
    // Delegate to the use-case which contains the business rules
    return this.updateProjectCodeUseCase.execute(id, projectCode, userId);
  }

  async listJurorsByProjectId(projectId: number) {
    const request: ListProjectJurorsRequest = { projectId };

    const res: ListProjectJurorsResponse = await lastValueFrom(
      this.projectsService.listProjectJurors(request),
    );

    return res.jurors;
  }

  async listAssignedProjectsByJuror(
    jurorUserId: number,
    eventId: number,
    page = 1,
    pageSize = 20,
  ) {
    const juror: JurorKey = {
      memberUserId: jurorUserId,
      memberEventId: eventId,
      memberRoleId: 4,
    };

    const request: ListAssignedProjectsRequest = {
      juror,
      page,
      pageSize,
    };

    const res: ListAssignedProjectsResponse = await lastValueFrom(
      this.projectsService.listAssignedProjects(request),
    );

    // If there are no projects, return early
    if (!res.items || res.items.length === 0) {
      return {
        items: [],
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
      };
    }

    // Get project IDs from the response
    const projectIds = res.items.map((project) => project.id);

    // Check evaluation status for these projects
    const evaluationStatusRequest: CheckEvaluationStatusRequest = {
      userId: jurorUserId,
      eventId: eventId,
      projectIds: projectIds,
    };

    const evaluationStatusResponse: CheckEvaluationStatusResponse =
      await lastValueFrom(
        this.evaluationService.checkEvaluationStatus(evaluationStatusRequest),
      );

    // Create a map for quick lookup
    const evaluationStatusMap = new Map(
      evaluationStatusResponse.projects.map((status) => [
        status.projectId,
        status,
      ]),
    );

    // Enrich projects with evaluation status
    // Cast items to ProjectComplete[] since the proto defines them as such
    const projectCompleteItems = res.items;

    const enrichedItems = projectCompleteItems.map((project) => {
      const status = evaluationStatusMap.get(project.id);
      return {
        id: project.id,
        eventId: project.eventId,
        name: project.name,
        description: project.description,
        eventNumber: project.eventNumber,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        courseId: project.courseId,
        state: project.state,
        reason: project.reason,
        participants: project.participants,
        documents: project.documents,
        pendingParticipants: project.pendingParticipants,
        evaluated: status?.evaluated || false,
        evaluation: status?.evaluation || null,
      };
    });

    return {
      items: enrichedItems,
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
    };
  }

  async addFilesToExistingProject(
    projectId: number,
    body: AddProjectDocumentsMultipartDto,
    files: any[],
  ) {
    this.logger.log(`Adding ${files.length} file(s) to project ${projectId}`);

    // 1. Validar que haya docs
    let documentMetadata: ProjectDocumentInputDto[] = [];
    if (body.documents) {
      try {
        documentMetadata = JSON.parse(body.documents);
      } catch (error: any) {
        throw new BadRequestException(
          'Invalid documents format. Must be a valid JSON array.',
        );
      }
    } else {
      throw new BadRequestException('documents field is required');
    }

    // 2. Validar que length de files == length de metadata
    if (files.length !== documentMetadata.length) {
      throw new BadRequestException(
        `Number of files (${files.length}) does not match number of document metadata entries (${documentMetadata.length})`,
      );
    }

    // 3. Validar tipos de documento
    const validTypes = Object.values(TypedDocument);
    const invalidDocs = documentMetadata.filter(
      (doc) => !validTypes.includes(doc.type),
    );
    if (invalidDocs.length > 0) {
      const invalidTypes = invalidDocs.map((doc) => doc.type).join(', ');
      throw new BadRequestException(
        `Invalid document type(s): ${invalidTypes}. Valid types are: ${validTypes.join(', ')}`,
      );
    }

    // 4. Validar máximo de files en ESTA petición
    if (files.length > 4) {
      throw new BadRequestException(
        'Maximum 4 files allowed per request: 1 logo, 1 poster, and 2 supporting documents',
      );
    }

    // 5. Validar tamaño de files (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map((f) => f.originalname).join(', ');
      throw new BadRequestException(
        `Files exceed 5MB limit: ${fileNames}. Maximum file size is 5MB per file.`,
      );
    }

    // 6. Validar distribución de tipos en ESTA petición
    const typeCounts = documentMetadata.reduce(
      (acc, doc) => {
        acc[doc.type] = (acc[doc.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    if (typeCounts['LOGO'] > 1) {
      throw new BadRequestException('Only 1 logo file is allowed per request');
    }
    if (typeCounts['POSTER'] > 1) {
      throw new BadRequestException(
        'Only 1 poster file is allowed per request',
      );
    }
    if (typeCounts['SUPPORTING_DOCUMENT'] > 2) {
      throw new BadRequestException(
        'Maximum 2 supporting document files are allowed per request',
      );
    }

    // 7. Validar estado del proyecto (evaluationsOpened = false y fecha actual < endDate)
    const projectGrpcResponse = await firstValueFrom(
      this.projectsService.getProject({ id: projectId }),
    );

    const project = (projectGrpcResponse as any).project ?? projectGrpcResponse;

    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    this.logger.log(
      `[addFilesToExistingProject] Project from gRPC: ${JSON.stringify(project)}`,
    );

    // 7.2. Obtener el evento asociado para revisar evaluaciones y fechas
    if (!project.eventId) {
      throw new BadRequestException(
        'Cannot add files: project is not linked to any event',
      );
    }

    const eventGrpcResponse = await firstValueFrom(
      this.eventsService.getEvent({ id: project.eventId }), // ✅ propiedad correcta
    );

    const event = (eventGrpcResponse as any).event ?? eventGrpcResponse;

    if (!event) {
      throw new NotFoundException(
        `Event with id ${project.eventId} not found for this project`,
      );
    }

    this.logger.log(
      `[addFilesToExistingProject] Event from gRPC: ${JSON.stringify(event)}`,
    );

    // 7.3. Leer evaluationsOpened y endDate (defensivo: camelCase y snake_case)
    const evaluationsOpened =
      event.evaluationsOpened ?? event.evaluations_opened ?? undefined;

    if (evaluationsOpened === undefined) {
      this.logger.warn(
        `[addFilesToExistingProject] evaluationsOpened is undefined in event: ${JSON.stringify(
          event,
        )}`,
      );
      throw new BadRequestException(
        'Cannot add files: event evaluations state is not properly configured',
      );
    }

    if (evaluationsOpened === true) {
      throw new BadRequestException(
        'Cannot add files: evaluations are already opened for this event/project',
      );
    }

    const rawEndDate = event.endDate ?? event.end_date ?? undefined;

    if (!rawEndDate) {
      throw new BadRequestException(
        'Cannot add files: event end date is not defined',
      );
    }

    const eventEndDate =
      rawEndDate instanceof Date ? rawEndDate : new Date(rawEndDate);

    const now = new Date();

    if (now >= eventEndDate) {
      throw new BadRequestException(
        'Cannot add files: event end date has already passed',
      );
    }

    // 8. Subir archivos a Azure
    this.logger.log(
      `Uploading ${files.length} file(s) to Azure Blob Storage for project ${projectId}`,
    );
    let uploadResults;
    try {
      const uploadPromises = files.map((file) =>
        this.azureBlobUploadService.uploadFile(file),
      );
      uploadResults = await Promise.all(uploadPromises);
      this.logger.log(`Successfully uploaded ${uploadResults.length} files`);
    } catch (error: any) {
      this.logger.error(
        `Failed to upload files to Azure: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(`Failed to upload files: ${error.message}`);
    }

    // 9. Adjuntar documentos al proyecto
    this.logger.log(
      `Attaching ${uploadResults.length} document(s) to project ${projectId}`,
    );
    try {
      const addDocumentPromises = uploadResults.map((uploadResult, index) =>
        firstValueFrom(
          this.projectsService.addProjectDocumentFromUrl({
            projectId,
            url: uploadResult.blobName,
            type: this.mapDocumentTypeToProto(documentMetadata[index].type),
          }),
        ),
      );
      await Promise.all(addDocumentPromises);
      this.logger.log(
        `Successfully attached ${uploadResults.length} documents to project ${projectId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to attach documents to project: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Files uploaded, but failed to attach documents: ${error.message}`,
      );
    }

    return {
      message: 'Files added to project successfully',
      success: true,
    };
  }

  async getMyProjectByEvent(
    userId: number,
    eventId: number,
  ): Promise<GetMyProjectByEventResponse> {
    const request: GetMyProjectByEventRequest = {
      userId,
      eventId,
    };
    return lastValueFrom(this.projectsService.getMyProjectByEvent(request));
  }

  async listUserParticipations(
    userId: number,
    email: string,
    limit?: number,
  ): Promise<ListUserParticipationsResponse> {
    return lastValueFrom(
      this.projectsService.listUserParticipations({ userId, email, limit }),
    );
  }
}
