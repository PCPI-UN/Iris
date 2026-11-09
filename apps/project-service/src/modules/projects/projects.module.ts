import { Module } from '@nestjs/common';
import { ProjectsController } from './interface/grpc/projects.controller';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PrismaProjectRepository } from './infrastructure/prisma/prisma-project.repository';
import { CreateProjectUC } from './application/use-cases/create-project.uc';
import { GetProjectUC } from './application/use-cases/get-project.uc';
import { ListProjectsByEventUC } from './application/use-cases/list-projects-by-event.uc';
import { AddProjectDocumentUC } from './application/use-cases/add-document.uc';
import { ListDocumentsUC } from './application/use-cases/list-documents.uc';
import { DeleteProjectUC } from './application/use-cases/delete-project.uc';
import { GetMyProjectByEventUC } from './application/use-cases/get-my-project-by-event.uc';
import { ListUserParticipationsUC } from './application/use-cases/list-user-participations.uc';
import { UpdateProjectUC } from './application/use-cases/update-project.uc';
import { ApproveProjectUC } from './application/use-cases/approve-project.uc';
import { RejectProjectUC } from './application/use-cases/reject-project.uc';
import { RequestChangesProjectUC } from './application/use-cases/request-changes-project.uc';
import { ChangeToUnderReviewProjectUC } from './application/use-cases/change-to-under-review-project.uc';
import { AssignJurorBulkUC } from './application/use-cases/assign-juror-bulk.uc';
import { ReassignProjectJurorUC } from './application/use-cases/reassign-project-juror.uc';
import { RemoveJurorFromProjectUC } from './application/use-cases/remove-juror-from-project.uc';
import { ListProjectJurorsUC } from './application/use-cases/list-project-jurors.uc';
import { GetDashboardStatsUC } from './application/use-cases/get-dashboard-stats.uc';
import { AddParticipantUC } from './application/use-cases/add-participant.uc';
import { ListParticipantsUC } from './application/use-cases/list-participants.uc';
import { AddPendingParticipantUC } from './application/use-cases/add-pending-participant.us';
import { ListPendingParticipantsUC } from './application/use-cases/list-pending-participants.uc';
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

@Module({
  controllers: [ProjectsController],
  imports: [
    InvitationClientModule,
    EventServiceModule,
    NotificationServiceModule,
  ],
  providers: [
    PrismaService,
    { provide: 'ProjectRepository', useClass: PrismaProjectRepository },

    CreateProjectUC,
    {
      provide: EVENT_SERVICE_PORT,
      useExisting: EventServiceAdapter,
    },
    GetProjectUC,
    ListProjectsByEventUC,
    AddProjectDocumentUC,
    ListDocumentsUC,
    DeleteProjectUC,
    GetMyProjectByEventUC,
    ListUserParticipationsUC,
    UpdateProjectUC,
    ApproveProjectUC,
    RejectProjectUC,
    AssignJurorBulkUC,
    ReassignProjectJurorUC,
    RemoveJurorFromProjectUC,
    ListProjectJurorsUC,
    GetDashboardStatsUC,
    AddParticipantUC,
    ListParticipantsUC,
    AddPendingParticipantUC,
    ListPendingParticipantsUC,
    ListProjectsAssignedToJurorUC,
    ListProjectsForReviewUC,
    NotificateStudentUC,
    UpdateProjectDocumentUC,
    RequestChangesProjectUC,
    CheckActiveSubmissionByEmailsUC,
    ChangeToUnderReviewProjectUC,
    ChangeToUnderReviewProjectUC,
    {
      provide: NOTIFICATION_SERVICE_PORT,
      useExisting: NotificationServiceAdapter,
    },
  ],
  exports: [ApproveProjectUC, CreateProjectUC, NotificateStudentUC],
})
export class ProjectsModule {}
