import { Controller, Inject, Injectable } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { CreateProjectUC } from '../../application/use-cases/create-project.uc';
import { ListProjectsByEventUC } from '../../application/use-cases/list-projects-by-event.uc';
import { GetProjectUC } from '../../application/use-cases/get-project.uc';
import { AddProjectDocumentUC } from '../../application/use-cases/add-document.uc';
import { ListDocumentsUC } from '../../application/use-cases/list-documents.uc';
import { DeleteProjectUC } from '../../application/use-cases/delete-project.uc';
import {
  toProtoProject,
  toProtoDocument,
  protoToState,
  protoToJurorKey,
  toProtoParticipant,
  protoToStatus,
  toProtoPendingParticipant,
  protoToTypedDocument,
  toProtoProjectComplete,
  protoToDocumentStatus,
} from './mappers';
import { UpdateProjectUC } from '../../application/use-cases/update-project.uc';
import { ApproveProjectUC } from '../../application/use-cases/approve-project.uc';
import { ChangeToUnderReviewProjectUC } from '../../application/use-cases/change-to-under-review-project.uc';
import { AssignJurorBulkUC } from '../../application/use-cases/assign-juror-bulk.uc';
import { ReassignProjectJurorUC } from '../../application/use-cases/reassign-project-juror.uc';
import { RemoveJurorFromProjectUC } from '../../application/use-cases/remove-juror-from-project.uc';
import { ListProjectJurorsUC } from '../../application/use-cases/list-project-jurors.uc';
import { GetDashboardStatsUC } from '../../application/use-cases/get-dashboard-stats.uc';
import { AddParticipantUC } from '../../application/use-cases/add-participant.uc';
import { ListParticipantsUC } from '../../application/use-cases/list-participants.uc';
import { AddPendingParticipantUC } from '../../application/use-cases/add-pending-participant.us';
import { ListPendingParticipantsUC } from '../../application/use-cases/list-pending-participants.uc';
import { ListProjectsAssignedToJurorUC } from '../../application/use-cases/list-projects-assigned-to-juror.uc';
import { NotificateStudentUC } from '../../application/use-cases/notificate-student.uc';
import { RejectProjectUC } from '../../application/use-cases/reject-project.uc';
import { ListProjectsForReviewUC } from '../../application/use-cases/list-projects-for-review.uc';
import { ListProjectsByFilterDTO } from '../../application/dto/list-projects.dto';
import { UpdateProjectDocumentUC } from '../../application/use-cases/update-document.uc';
import { RequestChangesProjectUC } from '../../application/use-cases/request-changes-project.uc';
import { GetMyProjectByEventUC } from '../../application/use-cases/get-my-project-by-event.uc';
import { ListUserParticipationsUC } from '../../application/use-cases/list-user-participations.uc';
import { CheckActiveSubmissionByEmailsUC } from '../../application/use-cases/check-active-submission-by-emails.uc';
import { ClientGrpc } from '@nestjs/microservices';
import { INVITATION_SERVICE_NAME } from '@app/common/generated/invitation';
import { lastValueFrom } from 'rxjs';
import { status } from '@grpc/grpc-js';

interface InvitationGrpcService {
  CreateInvitation(data: {
    email: string;
    eventType: string;
    targetType: string;
    targetId: number;
    invitedByUserId: number;
    roleIds: number[];
    firstName?: string;
    lastName?: string;
  }): any;
}

@Injectable()
@Controller()
export class ProjectsController {
  private invitationService: InvitationGrpcService;

  constructor(
    private readonly createProject: CreateProjectUC,
    private readonly getProject: GetProjectUC,
    private readonly listByEvent: ListProjectsByEventUC,
    private readonly addDoc: AddProjectDocumentUC,
    private readonly listDocs: ListDocumentsUC,
    private readonly deleteProjectUC: DeleteProjectUC,
    private readonly updateProjectUC: UpdateProjectUC,
    private readonly approveProjectUC: ApproveProjectUC,
    private readonly rejectProjectUC: RejectProjectUC,
    private readonly requestChangesProjectUC: RequestChangesProjectUC,
    private readonly assignJurorBulkUC: AssignJurorBulkUC,
    private readonly reassignProjectJurorUC: ReassignProjectJurorUC,
    private readonly removeJurorFromProjectUC: RemoveJurorFromProjectUC,
    private readonly listProjectJurorsUC: ListProjectJurorsUC,
    private readonly getDashboardStatsUC: GetDashboardStatsUC,
    private readonly addParticipantUC: AddParticipantUC,
    private readonly listParticipantsUC: ListParticipantsUC,
    private readonly addPendingParticipantUC: AddPendingParticipantUC,
    private readonly listPendingParticipantsUC: ListPendingParticipantsUC,
    private readonly listAssignedToJurorUC: ListProjectsAssignedToJurorUC,
    private readonly notificateStudentUC: NotificateStudentUC,
    private readonly listProjectsForReviewUC: ListProjectsForReviewUC,
    private readonly updateProjectDocumentUC: UpdateProjectDocumentUC,
    private readonly getMyProjectByEventUC: GetMyProjectByEventUC,
    private readonly listUserParticipationsUC: ListUserParticipationsUC,
    private readonly checkActiveSubmissionByEmailsUC: CheckActiveSubmissionByEmailsUC,
    private readonly changeToUnderReviewProjectUC: ChangeToUnderReviewProjectUC,
    @Inject(INVITATION_SERVICE_NAME) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.invitationService =
      this.client.getService<InvitationGrpcService>('InvitationService');
  }

  @GrpcMethod('ProjectsService', 'CreateProject')
  async createProjectRpc(req: any) {
    try {
      const project = await this.createProject.execute({
        eventId: req.eventId,
        courseId: req.courseId,
        name: req.name,
        projectCode: req.projectCode,
        description: req.description,
        eventNumber: req.eventNumber,
        state: protoToState(req.state),
      });
      return { project: toProtoProject(project) };
    } catch (err) {
      throw err;
    }
  }

  @GrpcMethod('ProjectsService', 'GetProject')
  async getProjectRpc(req: { id: number }) {
    const p = await this.getProject.execute({ id: req.id });
    return { project: toProtoProject(p) };
  }

  @GrpcMethod('ProjectsService', 'ListProjectsByEvent')
  async listProjectsByEventRpc(req: ListProjectsByFilterDTO) {
    if (req.state) {
      req.state = protoToState(parseInt(req.state));
    }
    const res = await this.listByEvent.execute(req);
    return {
      items: res.items.map(toProtoProjectComplete),
      total: res.total,
      currentPage: res.currentPage,
      itemsOnCurrentPage: res.itemsOnCurrentPage,
      itemsPerPage: res.itemsPerPage,
      totalPages: res.totalPages,
    };
  }

  @GrpcMethod('ProjectsService', 'AddProjectDocumentFromUrl')
  async addProjectDocumentFromUrl(req: any) {
    const doc = await this.addDoc.execute({
      projectId: req.projectId,
      url: req.url,
      type: protoToTypedDocument(req.type),
    });
    return { document: toProtoDocument(doc) };
  }

  @GrpcMethod('ProjectsService', 'ListProjectDocuments')
  async listProjectDocumentsRpc(req: { projectId: number }) {
    const items = await this.listDocs.execute({ projectId: req.projectId });
    return { items: items.map(toProtoDocument) };
  }

  @GrpcMethod('ProjectsService', 'DeleteProject')
  async deleteProjectRpc(req: { id: number }) {
    await this.deleteProjectUC.execute({ id: req.id });
    return { ok: true };
  }

  @GrpcMethod('ProjectsService', 'UpdateProject')
  async updateProjectRpc(req: any) {
    const updated = await this.updateProjectUC.execute({
      id: req.id,
      name: req.name,
      projectCode: req.projectCode,
      description: req.description,
      eventNumber: req.eventNumber,
      courseId: req.courseId,
      state: req.state ? protoToState(req.state) : undefined,
    });
    return { project: toProtoProject(updated) };
  }

  @GrpcMethod('ProjectsService', 'ApproveProject')
  async approveProjectRpc(req: { id: number; actingUserId: number, eventType: string }) {
    const updated = await this.approveProjectUC.execute({
      id: req.id,
      actingUserId: req.actingUserId,
      eventType: req.eventType,
    });
    return { project: toProtoProject(updated) };
  }

  @GrpcMethod('ProjectsService', 'RejectProject')
  async rejectProjectRpc(req: {
    id: number;
    actingUserId: number;
    reason?: string;
    eventType: string;
  }) {
    const updated = await this.rejectProjectUC.execute({
      id: req.id,
      actingUserId: req.actingUserId,
      reason: req.reason,
      eventType: req.eventType,
    });
    return { project: toProtoProject(updated) };
  }

  @GrpcMethod('ProjectsService', 'RequestChangesProject')
  async requestChangesProject(req: {
    id: number;
    actingUserId: number;
    reason?: string;
  }) {
    const updated = await this.requestChangesProjectUC.execute({
      id: req.id,
      actingUserId: req.actingUserId,
      reason: req.reason,
    });
    return { project: toProtoProject(updated) };
  }

  @GrpcMethod('ProjectsService', 'ChangeToUnderReviewProject')
  async changeToUnderReviewProjectRpc(req: {
    id: number;
    actingUserId: number;
  }) {
    const updated = await this.changeToUnderReviewProjectUC.execute({
      projectId: req.id,
      activeUserId: req.actingUserId,
    });
    return { project: toProtoProject(updated) };
  }

  @GrpcMethod('ProjectsService', 'AssignJurorToProjects')
  async assignJurorToProjectsRpc(req: any) {
    console.log('[ProjectsService] AssignJurorToProjects RPC input:', req);
    const result = await this.assignJurorBulkUC.execute({
      userId: req.userId,
      projectIds: req.projectIds ?? [],
    });
    return { assigned: result.assigned, failures: result.failures };
  }

  @GrpcMethod('ProjectsService', 'ReassignProjectJuror')
  async reassignProjectJurorRpc(req: any) {
    const result = await this.reassignProjectJurorUC.execute({
      projectId: req.projectId,
      fromUserId: req.fromUserId,
      toUserId: req.toUserId,
    });
    return { ok: result.ok, changed: result.changed };
  }

  @GrpcMethod('ProjectsService', 'RemoveJurorFromProject')
  async removeJurorFromProjectRpc(req: any) {
    const result = await this.removeJurorFromProjectUC.execute({
      projectId: req.projectId,
      userId: req.userId,
    });
    return {
      ok: result.ok,
      projectId: result.projectId,
      userId: result.userId,
      message: result.message,
    };
  }

  @GrpcMethod('ProjectsService', 'ListProjectJurors')
  async listProjectJurorsRpc(req: { projectId: number }) {
    const jurors = await this.listProjectJurorsUC.execute(req);
    return { jurors: jurors.map(protoToJurorKey) };
  }

  @GrpcMethod('ProjectsService', 'GetDashboardStats')
  async getDashboardStatsRpc() {
    return this.getDashboardStatsUC.execute();
  }

  @GrpcMethod('ProjectsService', 'AddParticipant')
  async addParticipantRpc(req: any) {
    const participant = await this.addParticipantUC.execute({
      projectId: req.projectId,
      userId: req.userId,
      studentCode: req.studentCode ?? undefined,
    });
    return { participant };
  }

  @GrpcMethod('ProjectsService', 'ListParticipants')
  async listParticipantsRpc(req: { projectId: number }) {
    const participants = await this.listParticipantsUC.execute({
      projectId: req.projectId,
    });
    return { items: participants.map(toProtoParticipant) };
  }

  @GrpcMethod('ProjectsService', 'AddPendingParticipant')
  async addPendingParticipantRpc(req: any) {
    const pendingParticipant = await this.addPendingParticipantUC.execute({
      projectId: req.projectId,
      firstName: req.firstName,
      lastName: req.lastName ?? undefined,
      email: req.email,
      studentCode: req.studentCode ?? undefined,
      semester: req.semester,
      career: req.career,
      status: protoToStatus(req.status),
    });
    return { participant: toProtoPendingParticipant(pendingParticipant) };
  }

  @GrpcMethod('ProjectsService', 'ListPendingParticipants')
  async listPendingParticipantsRpc(req: { projectId: number }) {
    const pendingParticipants = await this.listPendingParticipantsUC.execute({
      projectId: req.projectId,
    });
    return { items: pendingParticipants.map(toProtoPendingParticipant) };
  }

  @GrpcMethod('ProjectsService', 'CreateProjectWithPendingParticipants')
  async createProjectWithPendingParticipantsRpc(req: any) {
    if (req.participants && req.participants.length > 0) {
      const emails = req.participants.map((p: any) => p.email);
      const { hasConflict, conflictEmails } =
        await this.checkActiveSubmissionByEmailsUC.execute({
          eventId: req.eventId,
          emails,
        });
      if (hasConflict) {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: `Conflicting active submissions found for emails: ${conflictEmails.join(', ')}`,
        });
      }
    }

    try {
      const project = await this.createProject.execute({
        eventId: req.eventId,
        courseId: req.courseId,
        name: req.name,
        projectCode: req.projectCode,
        description: req.description,
        eventNumber: req.eventNumber, // Optional - set during confirmation
        state: 'UNDER_REVIEW',
      });
      console.log('Project created with ID:', project.id);
      const pendingParticipants = [];

      if (req.participants && req.participants.length > 0) {
        try {
          for (const p of req.participants) {
            const pendingParticipant =
              await this.addPendingParticipantUC.execute({
                projectId: project.id,
                firstName: p.firstName,
                lastName: p.lastName ?? undefined,
                email: p.email,
                studentCode: p.studentCode,
                semester: p.semester,
                career: p.career,
                status: 'PENDING',
              });
            pendingParticipants.push(
              toProtoPendingParticipant(pendingParticipant),
            );
          }
        } catch (error) {
          // Si hay un error al agregar participantes, eliminamos el proyecto creado
          console.error(
            '❌ Error adding pending participants, deleting project:',
            error,
          );
          await this.deleteProjectUC.execute({ id: project.id });
          throw error;
        }
        console.log('eventType=', req.eventType, JSON.stringify(req));
        for (const pending of pendingParticipants) {
          const obs$ = this.invitationService.CreateInvitation({
            email: pending.email, // ajusta al nombre real
            eventType: req.eventType,
            targetType: 'PROJECT',
            targetId: project.id,
            invitedByUserId: 1, // AJUSTA: quién envía la invitación
            roleIds: [5], // AJUSTA: roles si es necesario
            firstName: pending.firstName,
            lastName: pending.lastName ?? '',
          });
          //console.log('Sending invitation to:', pending.email);
          //console.log('Invitation observable:', obs$);

          await lastValueFrom(obs$);
        }
      }

      // Manejo de documentos del proyecto
      const projectDocuments = [];
      if (req.documents && req.documents.length > 0) {
        for (const d of req.documents) {
          const document = await this.addDoc.execute({
            projectId: project.id,
            url: d.url,
            type: protoToTypedDocument(d.type),
          });
          projectDocuments.push(toProtoDocument(document));
        }
      }
      return {
        project: toProtoProject(project),
        participants: pendingParticipants,
        documents: projectDocuments,
      };
    } catch (err) {
      console.error(
        '❌ Error creating project with pending participants and documents:',
        err,
      );
      throw err; // vuelve a lanzar el error original (para que NestJS lo registre bien)
    }
  }

  @GrpcMethod('ProjectsService', 'ListAssignedProjects')
  async listAssignedProjectsRpc(req: any) {
    const page = req.page && req.page > 0 ? req.page : 1;
    const pageSize = req.pageSize && req.pageSize > 0 ? req.pageSize : 20;

    const res = await this.listAssignedToJurorUC.execute({
      juror: protoToJurorKey(req.juror),
      page: page,
      pageSize: pageSize,
    });

    return {
      items: res.items.map(toProtoProjectComplete),
      total: res.total,
      page,
      pageSize,
    };
  }

  @GrpcMethod('ProjectsService', 'ListProjectsForReview')
  async listProjectsForReviewRpc(req: ListProjectsByFilterDTO) {
    const res = await this.listProjectsForReviewUC.execute(req);
    return {
      items: res.items.map(toProtoProject),
      total: res.total,
      currentPage: res.currentPage,
      itemsOnCurrentPage: res.itemsOnCurrentPage,
      itemsPerPage: res.itemsPerPage,
      totalPages: res.totalPages,
    };
  }

  @GrpcMethod('ProjectsService', 'GetProjectComplete')
  async getProjectCompleteRpc(req: { id: number }) {
    const project = await this.getProject.execute({ id: req.id });

    const [participants, documents, pending] = await Promise.all([
      this.listParticipantsUC.execute({ projectId: project.id }),
      this.listDocs.execute({ projectId: project.id }),
      this.listPendingParticipantsUC.execute({ projectId: project.id }),
    ]);

    const projectComplete = {
      ...project,
      participants,
      documents,
      pendingParticipants: pending,
    };

    return {
      items: [toProtoProjectComplete(projectComplete)],
    };
  }

  @GrpcMethod('ProjectsService', 'UpdateProjectDocument')
  async updateProjectDocumentRpc(req: any) {
    const updatedDoc = await this.updateProjectDocumentUC.execute({
      id: req.id,
      url: req.url,
      type: req.type ? protoToTypedDocument(req.type) : undefined,
      state: req.state ? protoToDocumentStatus(req.state) : undefined,
    });
    return { document: toProtoDocument(updatedDoc) };
  }

  @GrpcMethod('ProjectsService', 'GetMyProjectByEvent')
  async getMyProjectByEventRpc(req: { eventId: number; userId: number }) {
    const project = await this.getMyProjectByEventUC.execute({
      eventId: req.eventId,
      userId: req.userId,
    });
    return { project: toProtoProjectComplete(project) };
  }

  @GrpcMethod('ProjectsService', 'ListUserParticipations')
  async listUserParticipationsRpc(req: { userId: number; email: string; limit?: number }) {
    const { participations, academic, total } = await this.listUserParticipationsUC.execute({
      userId: req.userId,
      email: req.email,
      limit: req.limit,
    });
    return {
      total,
      academic: {
        studentCode: academic.studentCode ?? undefined,
        career: academic.career ?? undefined,
        semester: academic.semester ?? undefined,
      },
      participations: participations.map(p => ({
        project: toProtoProject(p.project),
        studentCode: p.studentCode,
        career: p.career ?? undefined,
        semester: p.semester ?? undefined,
      })),
    };
  }
}
