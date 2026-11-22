import { Inject, Injectable, Logger } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { normalizeEmail } from '@app/common/utils/email.util';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import {
  PendingProjectParticipant,
  Project,
  ProjectParticipant,
  ProjectState,
} from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  enrolledLogValue,
  ParticipantLogValue,
  participantAlreadyInProject,
  participantHasActiveProject,
  pendingLogValue,
} from '../../domain/admin-participants';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import { ProjectApprovalEffects } from '../services/project-approval-effects.service';
import { AddParticipantUC } from './add-participant.uc';
import { AddPendingParticipantUC } from './add-pending-participant.us';
import { CheckActiveSubmissionByEmailsUC } from './check-active-submission-by-emails.uc';
import { eventTypeName } from './admin-change-project-state.uc';

/** States in which a project keeps its participants busy in the event */
const ACTIVE_STATES: ProjectState[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'REQUEST_CHANGES',
];

export interface AdminPendingParticipantInput {
  firstName: string;
  lastName?: string | null;
  email: string;
  studentCode: string;
  semester: string;
  career: string;
}

export interface AdminAddParticipantInput {
  projectId: number;
  actingUserId: number;
  /** Enrolled participant: a platform user and their student code */
  userId?: number;
  studentCode?: string;
  /** Pending participant: a student without (or not yet linked to) an account */
  pending?: AdminPendingParticipantInput;
  reason?: string;
}

export interface AdminAddParticipantResult {
  participant?: ProjectParticipant;
  pendingParticipant?: PendingProjectParticipant;
  /** Work in other services that failed after the participant was saved */
  failedEffects: 'NOTIFICATION'[];
  /** Spanish warning for failedEffects, null when nothing failed */
  warning: string | null;
}

export const INVITATION_FAILED_WARNING =
  'El integrante se agregó, pero no se pudo enviar el correo de invitación; queda como pendiente sin invitar.';

/**
 * Administrative addition of a participant to a project: an enrolled one (platform user and
 * student code) or a pending one (name, email, code, semester and career). A student who is
 * already in the project, or in another project of the event that is not REJECTED, is not added
 * (409). Those checks, the participant and its PARTICIPANTS change log entry run in one
 * transaction, with the project and the student (in the event) locked, so two concurrent
 * additions cannot both pass the checks.
 *
 * A pending participant added to an APPROVED project gets the approval email, as the other
 * participants got it at the approval, and becomes INVITED; in other states it stays PENDING
 * until the project is approved.
 */
@Injectable()
export class AdminAddParticipantUC {
  private readonly logger = new Logger(AdminAddParticipantUC.name);

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly addParticipant: AddParticipantUC,
    private readonly addPendingParticipant: AddPendingParticipantUC,
    private readonly activeSubmissions: CheckActiveSubmissionByEmailsUC,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    private readonly approvalEffects: ProjectApprovalEffects,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(
    input: AdminAddParticipantInput,
  ): Promise<AdminAddParticipantResult> {
    const project = await this.repo.findById(input.projectId);
    if (!project) throw new NotFoundError('No se encontró el proyecto');

    const enrolled = input.userId !== undefined && input.userId !== null;
    if (enrolled === Boolean(input.pending)) {
      throw new ValidationError(
        'Indica un integrante inscrito (userId y código de estudiante) o uno pendiente (nombre, correo, código, semestre y carrera), no ambos',
      );
    }
    return enrolled
      ? this.addEnrolled(project, input)
      : this.addPending(project, input, input.pending!);
  }

  private async addEnrolled(
    project: Project,
    input: AdminAddParticipantInput,
  ): Promise<AdminAddParticipantResult> {
    const userId = input.userId!;
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError('El ID de usuario del integrante no es válido');
    }
    const studentCode = input.studentCode?.trim();
    if (!studentCode) {
      throw new ValidationError('El código de estudiante es obligatorio');
    }
    const [account] = await this.auth.findUsersByIds([userId]);
    if (!account) {
      throw new NotFoundError(`No se encontró el usuario ${userId}`);
    }
    const email = normalizeEmail(account.email);

    const entryValue = (participant: ProjectParticipant) =>
      enrolledLogValue(participant, account);
    const participant = await this.uow.run(async () => {
      // The checks run under the locks, so a concurrent addition cannot slip past them
      await this.lockStudent(project, email);
      const participants = await this.repo.listParticipants(project.id);
      if (participants.some((p) => p.userId === userId)) {
        throw participantAlreadyInProject(email, userId);
      }
      await this.assertNotInOtherProject(project, email, userId);

      // Upserts the participant and marks their pending row (same student code) as joined
      const saved = await this.addParticipant.execute({
        projectId: project.id,
        userId,
        studentCode,
      });
      // A pending row of this project with the same email is the same student even when it was
      // saved with another student code: it is joined too, so they are not counted twice
      const joinedAt = new Date();
      const samePending = (
        await this.repo.listPendingParticipants(project.id)
      ).filter(
        (p) =>
          p.status !== 'JOINED' &&
          p.studentCode !== studentCode &&
          normalizeEmail(p.email) === email,
      );
      for (const pending of samePending) {
        await this.repo.markPendingJoined(
          project.id,
          pending.studentCode,
          joinedAt,
        );
      }
      await this.record(project.id, input, entryValue(saved));
      return saved;
    });
    return { participant, failedEffects: [], warning: null };
  }

  private async addPending(
    project: Project,
    input: AdminAddParticipantInput,
    pending: AdminPendingParticipantInput,
  ): Promise<AdminAddParticipantResult> {
    const firstName = pending.firstName?.trim();
    if (!firstName) {
      throw new ValidationError('El nombre del integrante es obligatorio');
    }
    const email = normalizeEmail(pending.email ?? '');
    if (!isEmail(email)) {
      throw new ValidationError('El formato del correo no es válido');
    }

    // Read before the transaction: another service
    const account = await this.auth.findUserByEmail(email);

    const saved = await this.uow.run(async () => {
      // The checks run under the locks, so a concurrent addition cannot slip past them
      await this.lockStudent(project, email);
      const samePending = (await this.repo.listPendingParticipants(project.id))
        // Rows saved before emails were normalized may differ in case or spaces
        .find((p) => normalizeEmail(p.email) === email);
      if (samePending) throw participantAlreadyInProject(email);
      if (account) {
        const participants = await this.repo.listParticipants(project.id);
        if (participants.some((p) => p.userId === account.id)) {
          throw participantAlreadyInProject(email, account.id);
        }
      }
      await this.assertNotInOtherProject(project, email, account?.id);

      // Validates the email, code, semester and career; the email is not in the project
      // (checked above, under the lock), so this creates the row
      const row = await this.addPendingParticipant.execute({
        projectId: project.id,
        firstName,
        lastName: pending.lastName?.trim() || null,
        email,
        studentCode: pending.studentCode?.trim(),
        semester: pending.semester,
        career: pending.career,
        status: 'PENDING',
      });
      await this.record(project.id, input, pendingLogValue(row));
      return row;
    });

    if (project.state !== 'APPROVED') {
      return { pendingParticipant: saved, failedEffects: [], warning: null };
    }
    // Saved: from here on a failure is reported, not thrown, because the participant stays added
    try {
      const event = (await this.events.getEventById(project.eventId)) as {
        eventType?: unknown;
      } | null;
      const sent = await this.approvalEffects.notifyPendingParticipant(
        saved,
        { id: project.id, name: project.name },
        eventTypeName(event),
      );
      if (!sent) throw new Error('The invitation email was not sent');
      const invitedAt = new Date();
      await this.repo.markPendingsInvited(project.id, [email], invitedAt);
      return {
        pendingParticipant: { ...saved, status: 'INVITED' },
        failedEffects: [],
        warning: null,
      };
    } catch (error) {
      this.logger.error(
        `Invitation failed after adding a pending participant to project ${project.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      return {
        pendingParticipant: saved,
        failedEffects: ['NOTIFICATION'],
        warning: INVITATION_FAILED_WARNING,
      };
    }
  }

  /**
   * Locks the project (same-project additions and removals run one after the other) and the
   * student in the event (two projects of the event cannot both take them). Inside uow.run.
   */
  private async lockStudent(project: Project, email: string): Promise<void> {
    await this.repo.lockProject(project.id);
    await this.repo.lockStudentInEvent(project.eventId, email);
  }

  /** 409 when the student takes part in another project of the event that is not REJECTED. */
  private async assertNotInOtherProject(
    project: Project,
    email: string,
    userId?: number,
  ): Promise<void> {
    const { conflicts } = await this.activeSubmissions.execute({
      eventId: project.eventId,
      emails: [email],
    });
    const other = conflicts.find((c) => c.projectId !== project.id);
    if (other)
      throw participantHasActiveProject(email, other.projectId, userId);

    if (userId === undefined) return;
    const enrolledIn = (
      await this.repo.listProjectsByParticipant(userId, ACTIVE_STATES)
    ).find((p) => p.eventId === project.eventId && p.id !== project.id);
    if (enrolledIn) {
      throw participantHasActiveProject(email, enrolledIn.id, userId);
    }
  }

  private async record(
    projectId: number,
    input: AdminAddParticipantInput,
    participant: ParticipantLogValue,
  ): Promise<void> {
    // A new participant always differs from null, so the entry is never null
    const entry = buildProjectChangeLogEntry({
      projectId,
      actorUserId: input.actingUserId,
      action: 'PARTICIPANTS',
      before: { participant: null },
      after: { participant },
      reason: input.reason,
    })!;
    await this.changeLog.create(entry);
  }
}
