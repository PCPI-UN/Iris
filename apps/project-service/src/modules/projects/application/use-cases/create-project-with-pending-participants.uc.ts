import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateProjectWithPendingParticipantsDTO } from '../dto/create-project-with-pending-participants.dto';
import {
  PendingProjectParticipant,
  Project,
  ProjectDocument,
} from '../../domain/entities/project.entity';
import { ConflictError } from '../../domain/errors';
import {
  INVITATION_COMMAND_PORT,
  InvitationCommandPort,
} from '../ports/invitation.command-port';
import { CreateProjectUC } from './create-project.uc';
import { ResolvedTutors, SetProjectTutorsUC } from './set-project-tutors.uc';
import { CheckActiveSubmissionByEmailsUC } from './check-active-submission-by-emails.uc';
import { DeleteProjectUC } from './delete-project.uc';
import { AddPendingParticipantUC } from './add-pending-participant.us';
import { AddProjectDocumentUC } from './add-document.uc';

/** Role given to the students when they accept the invitation */
const PARTICIPANT_ROLE_ID = 5;

const stackOf = (error: unknown) =>
  error instanceof Error ? error.stack : String(error);

export interface CreateProjectWithPendingParticipantsResult {
  project: Project;
  participants: PendingProjectParticipant[];
  documents: ProjectDocument[];
}

/**
 * Public submission of a project. It is created UNDER_REVIEW with its students as pending
 * participants, each one invited by email; tutors get their role when the project is approved.
 *
 * Tutors and active submissions are checked before anything is written. If the tutors or the
 * pending participants cannot be stored the project is deleted; a failed invitation or document
 * leaves the project in place and the error goes out.
 */
@Injectable()
export class CreateProjectWithPendingParticipantsUC {
  private readonly logger = new Logger(
    CreateProjectWithPendingParticipantsUC.name,
  );

  constructor(
    private readonly createProject: CreateProjectUC,
    private readonly setProjectTutors: SetProjectTutorsUC,
    private readonly activeSubmissions: CheckActiveSubmissionByEmailsUC,
    private readonly deleteProject: DeleteProjectUC,
    private readonly addPendingParticipant: AddPendingParticipantUC,
    private readonly addDocument: AddProjectDocumentUC,
    @Inject(INVITATION_COMMAND_PORT)
    private readonly invitations: InvitationCommandPort,
  ) {}

  async execute(
    input: CreateProjectWithPendingParticipantsDTO,
  ): Promise<CreateProjectWithPendingParticipantsResult> {
    // Validated before anything is created, so a bad tutor selection leaves no project behind
    const tutors = await this.setProjectTutors.resolve({
      tutorUserIds: input.tutorUserIds ?? [],
      pendingTutors: input.pendingTutors ?? [],
    });

    const participants = input.participants ?? [];
    if (participants.length > 0) {
      const { hasConflict, conflictEmails } =
        await this.activeSubmissions.execute({
          eventId: input.eventId,
          emails: participants.map((p) => p.email),
        });
      if (hasConflict) {
        throw new ConflictError(
          `Estos correos ya tienen un proyecto activo en conflicto: ${conflictEmails.join(', ')}`,
        );
      }
    }

    try {
      return await this.createWithParticipants(input, tutors);
    } catch (err) {
      this.logger.error(
        `Public submission of project "${input.name}" in event ${input.eventId} failed`,
        stackOf(err),
      );
      throw err;
    }
  }

  private async createWithParticipants(
    input: CreateProjectWithPendingParticipantsDTO,
    tutors: ResolvedTutors,
  ): Promise<CreateProjectWithPendingParticipantsResult> {
    const participants = input.participants ?? [];
    const project = await this.createProject.execute({
      eventId: input.eventId,
      courseId: input.courseId,
      name: input.name,
      projectCode: input.projectCode,
      description: input.description,
      eventNumber: input.eventNumber,
      state: 'UNDER_REVIEW',
      nrc: input.nrc,
    });

    try {
      // The submission is public: tutors get their role and invitation when the project is approved
      await this.setProjectTutors.store(project.id, tutors);
    } catch (error) {
      this.logger.error(
        `Saving the tutors of project ${project.id} failed; deleting the project`,
        stackOf(error),
      );
      await this.deleteProject.execute({ id: project.id });
      throw error;
    }

    const pendingParticipants: PendingProjectParticipant[] = [];
    try {
      for (const p of participants) {
        pendingParticipants.push(
          await this.addPendingParticipant.execute({
            projectId: project.id,
            firstName: p.firstName,
            lastName: p.lastName ?? undefined,
            email: p.email,
            studentCode: p.studentCode,
            semester: p.semester,
            career: p.career,
            status: 'PENDING',
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        `Adding the pending participants of project ${project.id} failed; deleting the project`,
        stackOf(error),
      );
      await this.deleteProject.execute({ id: project.id });
      throw error;
    }

    for (const pending of pendingParticipants) {
      await this.invitations.createInvitation({
        email: pending.email,
        eventType: input.eventType,
        targetType: 'PROJECT',
        targetId: project.id,
        roleIds: [PARTICIPANT_ROLE_ID],
        firstName: pending.firstName,
        lastName: pending.lastName ?? '',
      });
    }

    const documents: ProjectDocument[] = [];
    for (const d of input.documents ?? []) {
      documents.push(
        await this.addDocument.execute({
          projectId: project.id,
          url: d.url,
          type: d.type,
        }),
      );
    }

    return { project, participants: pendingParticipants, documents };
  }
}
