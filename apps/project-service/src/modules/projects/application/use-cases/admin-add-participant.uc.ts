import { Inject, Injectable, Logger } from '@nestjs/common';
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
} from '../../domain/entities/project.entity';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { buildProjectChangeLogEntry } from '../../domain/project-change-log';
import {
  enrolledLogValue,
  ParticipantLogValue,
  pendingLogValue,
} from '../../domain/admin-participants';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import { ProjectApprovalEffects } from '../services/project-approval-effects.service';
import {
  PendingStudentInput,
  ProjectEnrollmentService,
} from '../services/project-enrollment.service';
import { eventTypeName } from './admin-change-project-state.uc';

export type AdminPendingParticipantInput = PendingStudentInput;

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

export const INVITED_NOT_MARKED_WARNING =
  'El integrante se agregó y se le envió el correo de invitación, pero no se pudo marcar como invitado; sigue figurando como pendiente.';

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
    private readonly enrollment: ProjectEnrollmentService,
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
    const { userId, studentCode } = this.enrollment.prepareEnrolled(
      input.userId!,
      input.studentCode,
    );
    const [account] = await this.auth.findUsersByIds([userId]);
    if (!account) {
      throw new NotFoundError(`No se encontró el usuario ${userId}`);
    }
    const email = normalizeEmail(account.email);

    const participant = await this.uow.run(async () => {
      const saved = await this.enrollment.enroll(project, {
        userId,
        studentCode,
        email,
      });
      await this.record(project.id, input, enrolledLogValue(saved, account));
      return saved;
    });
    return { participant, failedEffects: [], warning: null };
  }

  private async addPending(
    project: Project,
    input: AdminAddParticipantInput,
    pending: AdminPendingParticipantInput,
  ): Promise<AdminAddParticipantResult> {
    const student = this.enrollment.preparePending(pending);
    const { email } = student;

    // Read before the transaction: another service
    const account = await this.auth.findUserByEmail(email);

    const { saved, state } = await this.uow.run(async () => {
      // The state is read under the lock: an approval in between decides whether the
      // invitation goes out
      const { pending: row, project: current } =
        await this.enrollment.addPending(project, student, account?.id);
      await this.record(project.id, input, pendingLogValue(row));
      return { saved: row, state: current.state };
    });

    if (state !== 'APPROVED') {
      return { pendingParticipant: saved, failedEffects: [], warning: null };
    }
    // Saved: from here on a failure is reported, not thrown, because the participant stays added
    let sent: boolean;
    try {
      const event = (await this.events.getEventById(project.eventId)) as {
        eventType?: unknown;
      } | null;
      sent = await this.approvalEffects.notifyPendingParticipant(
        saved,
        { id: project.id, name: project.name },
        eventTypeName(event),
      );
    } catch (error) {
      this.logger.error(
        `Invitation email failed after adding a pending participant to project ${project.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      sent = false;
    }
    if (!sent) {
      return {
        pendingParticipant: saved,
        failedEffects: ['NOTIFICATION'],
        warning: INVITATION_FAILED_WARNING,
      };
    }
    // The email went out: a failure here only leaves the row PENDING
    const invitedAt = new Date();
    try {
      await this.repo.markPendingsInvited(project.id, [email], invitedAt);
    } catch (error) {
      this.logger.error(
        `Could not mark as invited the pending participant ${email} of project ${project.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      return {
        pendingParticipant: saved,
        failedEffects: [],
        warning: INVITED_NOT_MARKED_WARNING,
      };
    }
    return {
      pendingParticipant: { ...saved, status: 'INVITED', invitedAt },
      failedEffects: [],
      warning: null,
    };
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
