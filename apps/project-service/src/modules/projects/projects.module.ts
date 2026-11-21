import { Module } from '@nestjs/common';
import { ProjectsController } from './interface/grpc/projects.controller';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrismaProjectRepository } from './infrastructure/prisma/prisma-project.repository';
import { CreateProjectUC } from './application/use-cases/create-project.uc';
import { GetProjectUC } from './application/use-cases/get-project.uc';
import { ListProjectsByIdsUC } from './application/use-cases/list-projects-by-ids.uc';
import { ListProjectsByEventUC } from './application/use-cases/list-projects-by-event.uc';
import { AddProjectDocumentUC } from './application/use-cases/add-document.uc';
import { ListDocumentsUC } from './application/use-cases/list-documents.uc';
import { DeleteProjectUC } from './application/use-cases/delete-project.uc';
import { GetMyProjectByEventUC } from './application/use-cases/get-my-project-by-event.uc';
import { ListUserParticipationsUC } from './application/use-cases/list-user-participations.uc';
import { GetStudentParticipationStatsUC } from './application/use-cases/get-student-participation-stats.uc';
import { UpdateProjectUC } from './application/use-cases/update-project.uc';
import { ApproveProjectUC } from './application/use-cases/approve-project.uc';
import { RejectProjectUC } from './application/use-cases/reject-project.uc';
import { RequestChangesProjectUC } from './application/use-cases/request-changes-project.uc';
import { ChangeToUnderReviewProjectUC } from './application/use-cases/change-to-under-review-project.uc';
import { AssignJurorBulkUC } from './application/use-cases/assign-juror-bulk.uc';
import { ReassignProjectJurorUC } from './application/use-cases/reassign-project-juror.uc';
import { RemoveJurorFromProjectUC } from './application/use-cases/remove-juror-from-project.uc';
import { ListProjectJurorsUC } from './application/use-cases/list-project-jurors.uc';
import { CheckProjectAccessUC } from './application/use-cases/check-project-access.uc';
import { GetDashboardStatsUC } from './application/use-cases/get-dashboard-stats.uc';
import { AddParticipantUC } from './application/use-cases/add-participant.uc';
import { ListParticipantsUC } from './application/use-cases/list-participants.uc';
import { AddProjectTutorUC } from './application/use-cases/add-project-tutor.uc';
import { AddPendingParticipantUC } from './application/use-cases/add-pending-participant.us';
import { ListPendingParticipantsUC } from './application/use-cases/list-pending-participants.uc';
import { SetProjectTutorsUC } from './application/use-cases/set-project-tutors.uc';
import { ListProjectTutorsUC } from './application/use-cases/list-project-tutors.uc';
import { ResolveProjectReadScopeUC } from './application/use-cases/resolve-project-read-scope.uc';
import { AttachParticipantNamesUC } from './application/use-cases/attach-participant-names.uc';
import { ListProjectsInScopeUC } from './application/use-cases/list-projects-in-scope.uc';
import { GetProjectInScopeUC } from './application/use-cases/get-project-in-scope.uc';
import { ListEventIdsInScopeUC } from './application/use-cases/list-event-ids-in-scope.uc';
import { INVITATION_COMMAND_PORT } from './application/ports/invitation.command-port';
import { InvitationServiceAdapter } from './infrastructure/grpc-client/invitation-service.adapter';
import { InvitationClientModule } from './invitation-client.module';
import { EventServiceModule } from './event-service.module';
import { EventServiceAdapter } from './infrastructure/grpc-client/event-service.adapter';
import { EVENT_SERVICE_PORT } from './application/ports/event-service.port';
import { ListProjectsAssignedToJurorUC } from './application/use-cases/list-projects-assigned-to-juror.uc';
import { NotificationServiceModule } from './notification-service.module';
import { NOTIFICATION_SERVICE_PORT } from './application/ports/notification-service.port';
import { NotificationServiceAdapter } from './infrastructure/grpc-client/notification-service.adapter';
import { NotificateStudentUC } from './application/use-cases/notificate-student.uc';
import { ListProjectsForReviewUC } from './application/use-cases/list-projects-for-review.uc';
import { UpdateProjectDocumentUC } from './application/use-cases/update-document.uc';
import { CheckActiveSubmissionByEmailsUC } from './application/use-cases/check-active-submission-by-emails.uc';
import { AuthServiceModule } from './auth-service.module';
import { PreviewJurorImportUC } from './application/use-cases/preview-juror-import.uc';
import { ExecuteJurorImportUC } from './application/use-cases/execute-juror-import.uc';
import { GetJurorImportTemplateUC } from './application/use-cases/get-juror-import-template.uc';
import { AUTH_SERVICE_PORT } from './application/ports/auth-service.port';
import { AuthServiceAdapter } from './infrastructure/grpc-client/auth-service.adapter';
import { PROJECT_CHANGE_LOG_REPOSITORY } from './domain/repositories/project-change-log.repository';
import { PrismaProjectChangeLogRepository } from './infrastructure/prisma/prisma-project-change-log.repository';
import { ListProjectChangeLogUC } from './application/use-cases/list-project-change-log.uc';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { PrismaUnitOfWork } from './infrastructure/prisma/prisma-unit-of-work';

@Module({
  controllers: [ProjectsController],
  imports: [
    InvitationClientModule,
    EventServiceModule,
    NotificationServiceModule,
    AuthServiceModule,
  ],
  providers: [
    PrismaService,
    { provide: 'ProjectRepository', useClass: PrismaProjectRepository },
    {
      provide: PROJECT_CHANGE_LOG_REPOSITORY,
      useClass: PrismaProjectChangeLogRepository,
    },
    // Same module as the repositories, so it shares their PrismaService instance (and its transaction).
    { provide: UnitOfWork, useClass: PrismaUnitOfWork },
    ListProjectChangeLogUC,

    CreateProjectUC,
    {
      provide: EVENT_SERVICE_PORT,
      useExisting: EventServiceAdapter,
    },
    GetProjectUC,
    ListProjectsByIdsUC,
    ListProjectsByEventUC,
    AddProjectDocumentUC,
    ListDocumentsUC,
    DeleteProjectUC,
    GetMyProjectByEventUC,
    ListUserParticipationsUC,
    GetStudentParticipationStatsUC,
    UpdateProjectUC,
    ApproveProjectUC,
    RejectProjectUC,
    AssignJurorBulkUC,
    ReassignProjectJurorUC,
    RemoveJurorFromProjectUC,
    ListProjectJurorsUC,
    CheckProjectAccessUC,
    GetDashboardStatsUC,
    AddParticipantUC,
    ListParticipantsUC,
    AddPendingParticipantUC,
    AddProjectTutorUC,
    SetProjectTutorsUC,
    ListProjectTutorsUC,
    ResolveProjectReadScopeUC,
    AttachParticipantNamesUC,
    ListProjectsInScopeUC,
    GetProjectInScopeUC,
    ListEventIdsInScopeUC,
    InvitationServiceAdapter,
    { provide: INVITATION_COMMAND_PORT, useExisting: InvitationServiceAdapter },
    ListPendingParticipantsUC,
    ListProjectsAssignedToJurorUC,
    ListProjectsForReviewUC,
    NotificateStudentUC,
    UpdateProjectDocumentUC,
    RequestChangesProjectUC,
    CheckActiveSubmissionByEmailsUC,
    ChangeToUnderReviewProjectUC,
    ChangeToUnderReviewProjectUC,
    PreviewJurorImportUC,
    ExecuteJurorImportUC,
    GetJurorImportTemplateUC,
    {
      provide: NOTIFICATION_SERVICE_PORT,
      useExisting: NotificationServiceAdapter,
    },
    {
      provide: AUTH_SERVICE_PORT,
      useExisting: AuthServiceAdapter,
    },
  ],
  exports: [ApproveProjectUC, CreateProjectUC, NotificateStudentUC],
})
export class ProjectsModule {}
