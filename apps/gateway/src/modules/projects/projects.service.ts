import {
  Injectable,
  Inject,
  OnModuleInit,
  BadRequestException,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import type { CourseSectionsResponse } from '../events/dto/events/course-sections.response';
import { MAX_LIST_PROJECTS_BY_IDS } from '@app/common/constants/projects';
import {
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
  ProjectState,
  ProjectAccessAction,
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
  GetStudentParticipationStatsResponse,
  GetMyProjectByEventResponse,
  ListUserParticipationsResponse,
  AddPendingParticipantRequest,
  JurorKey,
  ListProjectsInScopeRequest,
  AdminParticipantsRejection,
} from '@app/common/generated/project';
import { CreateProjectWithParticipantsDto } from './dto/create-project-with-participants.dto';
import { CreateProjectWithParticipantsMultipartDto } from './dto/create-project-with-participants-multipart.dto';
import { AssignJurorToProjectsDto } from './dto/assign-juror-to-projects.dto';
import { ReassignProjectJurorDto } from './dto/reassign-project-juror.dto';
import { ApproveProjectDto } from './dto/approve-project.dto';
import { AddPendingParticipantDto } from './dto/add-pending-participant.dto';
import { RejectProjectDto } from './dto/reject-project.dto';
import { AdminChangeProjectStateDto } from './dto/admin-change-project-state.dto';
import {
  ADMIN_PROJECT_EDITABLE_FIELDS,
  AdminUpdateProjectDto,
} from './dto/admin-update-project.dto';
import {
  TypedDocument,
  ProjectDocumentInputDto,
} from './dto/project-document-input.dto';
import { ProjectTutorsInputDto } from './dto/project-tutors-input.dto';
import { parseProjectTutors } from './parse-project-tutors';
import { toProjectTutorsResponse } from './project-tutors-response';
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
import { withoutOneofMarkers } from '@app/common/utils/grpc-oneof.util';
import { pendingStatus } from '@app/common/utils/pending-status.util';
import { AdminAddParticipantDto } from './dto/admin-participant.dto';
import {
  ADMIN_DOCUMENT_MAX_FILE_SIZE,
  AdminChangeProjectDocumentStateDto,
  AdminReplaceProjectDocumentDto,
} from './dto/admin-project-document.dto';
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
import {
  ProjectChangeAction,
  ProjectChangeLogResponseDto,
} from './dto/project-change-log-response.dto';

/** Platform roles a project tutor can be picked from: Professor (9) and Tutor (10). */
const TUTOR_CANDIDATE_ROLE_IDS = [9, 10];

export type {
  JurorProfile,
  ProjectWithEnrichedJurors,
} from './types/project-enrichment.types';

/** `code` of the 409 of an administrative state change that needs force */
export const PROJECT_STATE_CHANGE_BLOCKED = 'PROJECT_STATE_CHANGE_BLOCKED';
/** `code` of the 409 of an administrative edit: another project of the event has the name */
export const PROJECT_NAME_TAKEN = 'PROJECT_NAME_TAKEN';
export const LAST_PARTICIPANT = 'LAST_PARTICIPANT';

/**
 * HTTP error of a rejected change of the participants: 400 for LAST_PARTICIPANT, 409 for the
 * others (PARTICIPANT_HAS_ACTIVE_PROJECT, PARTICIPANT_ALREADY_IN_PROJECT), with `code` and the
 * known cause fields in `details`.
 */
export function participantsRejection(rejected: AdminParticipantsRejection) {
  const { code, message, ...rest } = withoutOneofMarkers(rejected);
  const details = Object.fromEntries(
    Object.entries(rest).filter(
      ([key, value]) =>
        value !== undefined && value !== null && !key.startsWith('_'),
    ),
  );
  const body = { message, code, details };
  return code === LAST_PARTICIPANT
    ? new BadRequestException(body)
    : new ConflictException(body);
}
/** `code` of the 409 of an administrative category change of a project with evaluations */
export const PROJECT_CATEGORY_CHANGE_BLOCKED =
  'PROJECT_CATEGORY_CHANGE_BLOCKED';

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
        'Tipo de evento no válido. Debe ser "Competition" o "Exposition".',
      );
    }

    let participants: PendingParticipantInputDto[] = [];
    if (body.participants) {
      try {
        participants = JSON.parse(body.participants);
      } catch (error: any) {
        throw new BadRequestException(
          'El formato de los participantes no es válido. Debe ser un arreglo JSON válido.',
        );
      }
    }

    const tutors = parseProjectTutors(body.tutors);

    let documentMetadata: ProjectDocumentInputDto[] = [];
    if (body.documents) {
      try {
        documentMetadata = JSON.parse(body.documents);
      } catch (error: any) {
        throw new BadRequestException(
          'El formato de los documentos no es válido. Debe ser un arreglo JSON válido.',
        );
      }
    }

    if (files.length !== documentMetadata.length) {
      throw new BadRequestException(
        `La cantidad de archivos (${files.length}) no coincide con la cantidad de documentos descritos (${documentMetadata.length})`,
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
        `Tipos de documento no válidos: ${invalidTypes}. Los tipos válidos son: ${validTypes.join(', ')}`,
      );
    }

    // Validate maximum file count (1 logo + 1 poster + 2 supporting docs = 4 max)
    if (files.length > 4) {
      throw new BadRequestException(
        'Se permiten máximo 4 archivos: 1 logo, 1 póster y 2 documentos de soporte',
      );
    }

    // Validate file sizes (25MB max per file)
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
    const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map((f) => f.originalname).join(', ');
      throw new BadRequestException(
        `Estos archivos superan el límite de 25 MB: ${fileNames}. El tamaño máximo es 25 MB por archivo.`,
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
      throw new BadRequestException('Solo se permite 1 archivo de logo');
    }
    if (typeCounts['POSTER'] > 1) {
      throw new BadRequestException('Solo se permite 1 archivo de póster');
    }
    if (typeCounts['SUPPORTING_DOCUMENT'] > 2) {
      throw new BadRequestException(
        'Se permiten máximo 2 documentos de soporte',
      );
    }

    const eventId = parseInt(body.eventId, 10);
    const courseId = parseInt(body.courseId, 10);

    if (isNaN(eventId) || isNaN(courseId)) {
      throw new BadRequestException(
        'eventId y courseId deben ser números válidos',
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
          nrc: body.nrc,
          name: body.name,
          description: body.description,
          projectCode: body.projectCode,
          tutorUserIds: tutors.userIds,
          pendingTutors: tutors.pending,
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
        throw new BadRequestException(
          'La creación del proyecto no devolvió ningún proyecto',
        );
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
        `Se creó el proyecto, pero no se pudieron subir los archivos: ${error.message}`,
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
        `Se creó el proyecto y se subieron los archivos, pero no se pudieron adjuntar los documentos: ${error.message}`,
      );
    }

    // Return the created project
    return { message: 'Proyecto enviado correctamente', success: true };
  }

  async createProjectWithParticipants(dto: CreateProjectWithParticipantsDto) {
    const response = await firstValueFrom(
      this.projectsService.createProjectWithPendingParticipants({
        eventId: dto.eventId,
        eventType: dto.eventType,
        courseId: dto.courseId,
        nrc: dto.nrc,
        name: dto.name,
        description: dto.description,
        projectCode: dto.projectCode,
        tutorUserIds: [],
        pendingTutors: [],
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

  /**
   * Fails with 403 unless the user may read or edit the project (or the project of the
   * document). project-service decides: confirmed participants, assigned jurors (read only)
   * and platform staff (read:events to read, manage:events to edit).
   */
  async assertProjectAccess(
    userId: number,
    action: 'READ' | 'EDIT',
    target: { projectId: number } | { documentId: number },
  ): Promise<void> {
    await firstValueFrom(
      this.projectsService.checkProjectAccess({
        userId,
        action:
          action === 'READ'
            ? ProjectAccessAction.PROJECT_ACCESS_READ
            : ProjectAccessAction.PROJECT_ACCESS_EDIT,
        projectId: 'projectId' in target ? target.projectId : 0,
        documentId: 'documentId' in target ? target.documentId : 0,
      }),
    );
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

    return firstValueFrom(this.projectsService.addPendingParticipant(request));
  }

  /**
   * Active users with the Tutor or Professor role whose name matches `search`.
   * Id and name only: the email of other users is not exposed.
   */
  async searchTutorCandidates(search: string) {
    const { users } = await this.authService.findUsersByRoles({
      roleIds: TUTOR_CANDIDATE_ROLE_IDS,
      search: search.trim(),
      userIds: [],
    });
    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    }));
  }

  /** Replaces the tutors; project-service records the change (TUTORS) with the acting user. */
  async setProjectTutors(
    projectId: number,
    dto: ProjectTutorsInputDto,
    actingUserId: number,
  ) {
    const res = await firstValueFrom(
      this.projectsService.setProjectTutors({
        projectId,
        tutorUserIds: dto.userIds,
        pendingTutors: dto.pending,
        actingUserId,
        reason: dto.reason?.trim() ?? '',
      }),
    );
    return { ...res, tutors: toProjectTutorsResponse(res.tutors) };
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

  async approveProject(
    dto: { id: number; eventType: string },
    actingUserId: number,
  ) {
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

  /**
   * Administrative state change. When project-service answers `blocked` (juror evaluations
   * or published results, without force) nothing changed: answers 409 with the cause in
   * `details` so the client can ask for confirmation and resend with force.
   */
  async adminChangeProjectState(
    id: number,
    dto: AdminChangeProjectStateDto,
    actingUserId: number,
  ) {
    const response = await firstValueFrom(
      this.projectsService.adminChangeProjectState({
        id,
        actingUserId,
        state: ProjectState[dto.state],
        reason: dto.reason,
        notify: dto.notify === true,
        force: dto.force === true,
      }),
    );
    if (response.blocked) {
      const { message, ...details } = response.blocked;
      throw new ConflictException({
        message,
        code: PROJECT_STATE_CHANGE_BLOCKED,
        details,
      });
    }
    // The change is saved even if work in other services failed afterwards
    return {
      project: response.project,
      failedEffects: response.failedEffects ?? [],
      warning: response.warning || null,
    };
  }

  /**
   * Administrative edit of the basic data and the category. A body without any editable field
   * is a 400. When project-service answers `conflict` nothing changed: answers 409 with `code`
   * (PROJECT_NAME_TAKEN, PROJECT_CATEGORY_CHANGE_BLOCKED or PROJECT_CHANGED_MEANWHILE) and the
   * cause in `details`.
   */
  async adminUpdateProject(
    id: number,
    dto: AdminUpdateProjectDto,
    actingUserId: number,
  ) {
    if (
      ADMIN_PROJECT_EDITABLE_FIELDS.every(
        // A null name is not an edit; null clears the other text fields
        (field) =>
          dto[field] === undefined || (field === 'name' && dto.name === null),
      )
    ) {
      throw new BadRequestException(
        'Indica al menos un dato del proyecto para modificar: name, description, projectCode, eventNumber o courseId',
      );
    }
    // null clears a text field: project-service reads the empty text as "clear"
    const text = (value: string | null | undefined) =>
      value === null ? '' : value;
    const response = await firstValueFrom(
      this.projectsService.adminUpdateProject({
        id,
        actingUserId,
        name: dto.name ?? undefined,
        description: text(dto.description),
        projectCode: text(dto.projectCode),
        eventNumber: text(dto.eventNumber),
        courseId: dto.courseId,
        reason: dto.reason ?? '',
        force: dto.force === true,
      }),
    );
    if (response.conflict) {
      const { code, message, evaluationCount, name } = response.conflict;
      throw new ConflictException({
        message,
        code,
        details:
          code === PROJECT_CATEGORY_CHANGE_BLOCKED
            ? { evaluationCount }
            : code === PROJECT_NAME_TAKEN
              ? { name }
              : {},
      });
    }
    // Drops the oneof markers of the optional fields (_description: 'description')
    return withoutOneofMarkers(response.project);
  }

  /**
   * Administrative addition of a participant. When project-service answers `rejected` nothing
   * changed: 409 with `code` (PARTICIPANT_HAS_ACTIVE_PROJECT or PARTICIPANT_ALREADY_IN_PROJECT)
   * and the cause in `details`.
   */
  async adminAddParticipant(
    id: number,
    dto: AdminAddParticipantDto,
    actingUserId: number,
  ) {
    const enrolled = dto.userId !== undefined && dto.userId !== null;
    const response = await firstValueFrom(
      this.projectsService.adminAddParticipant({
        projectId: id,
        actingUserId,
        userId: enrolled ? dto.userId : undefined,
        studentCode: enrolled ? dto.studentCode : undefined,
        pending: enrolled
          ? undefined
          : {
              firstName: dto.firstName ?? '',
              lastName: dto.lastName || undefined,
              email: dto.email ?? '',
              studentCode: dto.studentCode,
              semester: dto.semester ?? '',
              career: dto.career ?? '',
            },
        reason: dto.reason ?? '',
      }),
    );
    if (response.rejected) throw participantsRejection(response.rejected);
    const pending = response.pendingParticipant;
    return {
      participant: response.participant
        ? withoutOneofMarkers(response.participant)
        : null,
      pendingParticipant: pending
        ? { ...pending, status: pendingStatus(pending.status) }
        : null,
      failedEffects: response.failedEffects ?? [],
      warning: response.warning || null,
    };
  }

  /**
   * Administrative removal of an enrolled (userId) or pending (pendingId) participant. Removing
   * the last participant answers 400 with code LAST_PARTICIPANT.
   */
  async adminRemoveParticipant(
    id: number,
    target: { userId?: number; pendingId?: number },
    reason: string | undefined,
    actingUserId: number,
  ): Promise<void> {
    const response = await firstValueFrom(
      this.projectsService.adminRemoveParticipant({
        projectId: id,
        actingUserId,
        ...target,
        reason: reason ?? '',
      }),
    );
    if (response.rejected) throw participantsRejection(response.rejected);
  }

  /** Every document of the project, INACTIVE ones included (the other reads leave them out). */
  async adminListProjectDocuments(
    projectId: number,
  ): Promise<ProjectDocument[]> {
    const { items } = await lastValueFrom(
      this.projectsService.listProjectDocuments({
        projectId,
        includeInactive: true,
      }),
    );
    return items ?? [];
  }

  /**
   * Administrative replacement of the file of a document. The file is checked and the document
   * looked up in the project before the upload, so a wrong request leaves no blob behind; if
   * project-service then fails, the new blob is deleted (best effort). The document stores the
   * blob name (the response signs it). The old blob is kept.
   */
  async adminReplaceProjectDocument(
    projectId: number,
    documentId: number,
    file: Express.Multer.File | undefined,
    dto: AdminReplaceProjectDocumentDto,
    actingUserId: number,
  ): Promise<ProjectDocument | undefined> {
    if (!file) {
      throw new BadRequestException(
        'Adjunta el archivo nuevo del documento en el campo file',
      );
    }
    if (file.size > ADMIN_DOCUMENT_MAX_FILE_SIZE) {
      throw new BadRequestException(
        `El archivo ${file.originalname} supera el límite de 5 MB. El tamaño máximo es 5 MB por archivo.`,
      );
    }
    const documents = await this.adminListProjectDocuments(projectId);
    if (!documents.some((document) => document.id === documentId)) {
      throw new NotFoundException(
        `No se encontró el documento ${documentId} en este proyecto`,
      );
    }

    const { blobName } = await this.azureBlobUploadService.uploadFile(file);
    try {
      const res = await firstValueFrom(
        this.projectsService.adminReplaceProjectDocument({
          projectId,
          documentId,
          actingUserId,
          url: blobName,
          reason: dto.reason ?? '',
        }),
      );
      return res.document;
    } catch (error) {
      // No document points to the new blob: remove it (best effort) so it is not left orphaned
      await this.azureBlobUploadService.deleteFile(blobName);
      throw error;
    }
  }

  /** Administrative activation or deactivation of a document of the project. */
  async adminChangeProjectDocumentState(
    projectId: number,
    documentId: number,
    dto: AdminChangeProjectDocumentStateDto,
    actingUserId: number,
  ): Promise<ProjectDocument | undefined> {
    const res = await firstValueFrom(
      this.projectsService.adminChangeProjectDocumentState({
        projectId,
        documentId,
        actingUserId,
        state: this.mapDocumentStatusToProto(dto.state)!,
        reason: dto.reason ?? '',
      }),
    );
    return res.document;
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

  /**
   * Academic reads: project-service resolves the projects the user may read from their
   * scope permissions (tutored, of their course sections or department, or all of them).
   */
  async listProjectsInScope(
    request: ListProjectsInScopeRequest,
  ): Promise<ListProjectsResponse> {
    return lastValueFrom(this.projectsService.listProjectsInScope(request));
  }

  /** Every project of the user's scope that matches the filters, page after page */
  async listAllProjectsInScope(
    request: Omit<ListProjectsInScopeRequest, 'currentPage' | 'itemsPerPage'>,
  ): Promise<ProjectComplete[]> {
    const itemsPerPage = 100;
    const projects: ProjectComplete[] = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
      const page = await this.listProjectsInScope({
        ...request,
        currentPage,
        itemsPerPage,
      });
      projects.push(...(page.items ?? []));
      totalPages = page.totalPages ?? 1;
      currentPage++;
    } while (currentPage <= totalPages);
    return projects;
  }

  /** NOT_FOUND (404) when the project does not exist or is outside the user's scope */
  async getProjectInScope(
    userId: number,
    projectId: number,
  ): Promise<ProjectComplete> {
    return lastValueFrom(
      this.projectsService.getProjectInScope({ userId, projectId }),
    );
  }

  async listEventIdsInScope(userId: number): Promise<number[]> {
    const response = await lastValueFrom(
      this.projectsService.listEventIdsInScope({ userId }),
    );
    return response.eventIds ?? [];
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

    const {
      participants,
      pendingParticipants,
      documents,
      tutors,
      ...projectInfo
    } = project;

    return {
      confirmedParticipants: participants,
      pendingParticipants,
      tutors,
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
      throw new NotFoundException('No se encontró el proyecto');
    }

    return { ...project, tutors: toProjectTutorsResponse(project.tutors) };
  }

  /**
   * Names of the given projects through project-service ListProjectsByIds, in calls of
   * at most MAX_LIST_PROJECTS_BY_IDS distinct ids, so a public listing makes a bounded
   * number of calls. Ids project-service does not return (deleted projects) are logged
   * and left out of the map.
   */
  async getProjectNamesByIds(ids: number[]): Promise<Map<number, string>> {
    const uniqueIds = [...new Set(ids)];
    const names = new Map<number, string>();

    for (let i = 0; i < uniqueIds.length; i += MAX_LIST_PROJECTS_BY_IDS) {
      const chunk = uniqueIds.slice(i, i + MAX_LIST_PROJECTS_BY_IDS);
      const response = await firstValueFrom(
        this.projectsService.listProjectsByIds({ ids: chunk }),
      );
      for (const project of response.items ?? []) {
        names.set(project.id, project.name);
      }
    }

    const missing = uniqueIds.filter((id) => !names.has(id));
    if (missing.length) {
      this.logger.warn(
        `[getProjectNamesByIds] Projects not found: ${missing.join(', ')}`,
      );
    }
    return names;
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
      // Only ACTIVE documents: an INACTIVE one was withdrawn and its link answers 404
      this.projectsService.listProjectDocuments({
        projectId,
        includeInactive: false,
      }),
    );
    const document = items?.find((item) => item.id === documentId);
    if (!document) {
      throw new NotFoundException('No se encontró el documento del proyecto');
    }

    const url = this.azureBlobUploadService.openUrl(document.url);
    if (!url) {
      throw new NotFoundException(
        'El documento del proyecto no tiene un archivo guardado',
      );
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
      throw new NotFoundException('No se encontró el documento del proyecto');
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

  /**
   * Administrative changes of a project, most recent first, with the name of each author
   * read from auth-service. project-service answers NOT_FOUND when the project does not exist.
   */
  async listProjectChangeLog(
    projectId: number,
  ): Promise<ProjectChangeLogResponseDto> {
    const { entries = [] } = await firstValueFrom(
      this.projectsService.listProjectChangeLog({ projectId }),
    );
    const profiles = await this.fetchUserProfilesUseCase.execute(
      new Set(entries.map((entry) => entry.actorUserId)),
    );
    const parseValues = (
      entryId: number,
      json: string,
    ): Record<string, unknown> => {
      try {
        const value: unknown = JSON.parse(json || '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return value as Record<string, unknown>;
        }
      } catch {
        // logged below, like a value that is not an object
      }
      this.logger.warn(
        `Change log entry ${entryId} of project ${projectId} has invalid before/after JSON`,
      );
      return {};
    };
    return {
      entries: entries.map((entry) => {
        const profile = profiles.get(entry.actorUserId);
        const name =
          `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
        return {
          id: entry.id,
          action: entry.action as ProjectChangeAction,
          actor: { id: entry.actorUserId, name: name || null },
          createdAt: entry.createdAt,
          before: parseValues(entry.id, entry.beforeJson),
          after: parseValues(entry.id, entry.afterJson),
          reason: entry.reason ?? null,
        };
      }),
    };
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
          'El formato de los documentos no es válido. Debe ser un arreglo JSON válido.',
        );
      }
    } else {
      throw new BadRequestException('El campo documents es obligatorio');
    }

    // 2. Validar que length de files == length de metadata
    if (files.length !== documentMetadata.length) {
      throw new BadRequestException(
        `La cantidad de archivos (${files.length}) no coincide con la cantidad de documentos descritos (${documentMetadata.length})`,
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
        `Tipos de documento no válidos: ${invalidTypes}. Los tipos válidos son: ${validTypes.join(', ')}`,
      );
    }

    // 4. Validar máximo de files en ESTA petición
    if (files.length > 4) {
      throw new BadRequestException(
        'Se permiten máximo 4 archivos por solicitud: 1 logo, 1 póster y 2 documentos de soporte',
      );
    }

    // 5. Validar tamaño de files (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE);
    if (oversizedFiles.length > 0) {
      const fileNames = oversizedFiles.map((f) => f.originalname).join(', ');
      throw new BadRequestException(
        `Estos archivos superan el límite de 5 MB: ${fileNames}. El tamaño máximo es 5 MB por archivo.`,
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
      throw new BadRequestException(
        'Solo se permite 1 archivo de logo por solicitud',
      );
    }
    if (typeCounts['POSTER'] > 1) {
      throw new BadRequestException(
        'Solo se permite 1 archivo de póster por solicitud',
      );
    }
    if (typeCounts['SUPPORTING_DOCUMENT'] > 2) {
      throw new BadRequestException(
        'Se permiten máximo 2 documentos de soporte por solicitud',
      );
    }

    // 7. Validar estado del proyecto (evaluationsOpened = false y fecha actual < endDate)
    const projectGrpcResponse = await firstValueFrom(
      this.projectsService.getProject({ id: projectId }),
    );

    const project = (projectGrpcResponse as any).project ?? projectGrpcResponse;

    if (!project) {
      throw new NotFoundException(
        `No se encontró el proyecto con ID ${projectId}`,
      );
    }

    this.logger.log(
      `[addFilesToExistingProject] Project from gRPC: ${JSON.stringify(project)}`,
    );

    // 7.2. Obtener el evento asociado para revisar evaluaciones y fechas
    if (!project.eventId) {
      throw new BadRequestException(
        'No se pueden agregar archivos: el proyecto no está vinculado a ningún evento',
      );
    }

    const eventGrpcResponse = await firstValueFrom(
      this.eventsService.getEvent({ id: project.eventId }), // ✅ propiedad correcta
    );

    const event = (eventGrpcResponse as any).event ?? eventGrpcResponse;

    if (!event) {
      throw new NotFoundException(
        `No se encontró el evento con ID ${project.eventId} de este proyecto`,
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
        'No se pueden agregar archivos: el estado de evaluaciones del evento no está bien configurado',
      );
    }

    if (evaluationsOpened === true) {
      throw new BadRequestException(
        'No se pueden agregar archivos: las evaluaciones de este evento ya están abiertas',
      );
    }

    const rawEndDate = event.endDate ?? event.end_date ?? undefined;

    if (!rawEndDate) {
      throw new BadRequestException(
        'No se pueden agregar archivos: el evento no tiene fecha de finalización',
      );
    }

    const eventEndDate =
      rawEndDate instanceof Date ? rawEndDate : new Date(rawEndDate);

    const now = new Date();

    if (now >= eventEndDate) {
      throw new BadRequestException(
        'No se pueden agregar archivos: la fecha de finalización del evento ya pasó',
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
      throw new BadRequestException(
        `No se pudieron subir los archivos: ${error.message}`,
      );
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
        `Se subieron los archivos, pero no se pudieron adjuntar los documentos: ${error.message}`,
      );
    }

    return {
      message: 'Archivos agregados al proyecto correctamente',
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
    const res = await lastValueFrom(
      this.projectsService.getMyProjectByEvent(request),
    );
    return res.project
      ? {
          ...res,
          project: {
            ...res.project,
            tutors: toProjectTutorsResponse(res.project.tutors),
          },
        }
      : res;
  }

  /** Course sections (NRC) of the term of the event, without the professors' emails or the gRPC client's `_field` keys */
  async listCourseSections(eventId: number): Promise<CourseSectionsResponse> {
    const res = await lastValueFrom(
      this.projectsService.listCourseSections({ eventId }),
    );
    return {
      sections: (res.sections ?? []).map((section) => ({
        id: section.id,
        nrc: section.nrc,
        name: section.name,
        professor: section.professor
          ? {
              userId: section.professor.userId,
              firstName: section.professor.firstName,
              lastName: section.professor.lastName ?? null,
            }
          : null,
      })),
      professorsAvailable: res.professorsAvailable,
    };
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

  /** Data of the student dashboard; userId and email must come from the session */
  async getStudentParticipationStats(
    userId: number,
    email: string,
  ): Promise<GetStudentParticipationStatsResponse> {
    return lastValueFrom(
      this.projectsService.getStudentParticipationStats({ userId, email }),
    );
  }
}
