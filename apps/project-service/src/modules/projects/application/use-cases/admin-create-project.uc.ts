import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_CHANGE_LOG_REPOSITORY,
  ProjectChangeLogRepository,
} from '../../domain/repositories/project-change-log.repository';
import {
  PendingProjectParticipant,
  Project,
  StudentStatus,
} from '../../domain/entities/project.entity';
import { ValidationError } from '../../domain/errors';
import { AdminParticipantsError } from '../../domain/admin-participants';
import {
  AdminCreateEffect,
  AdminCreateOrigin,
  ParticipantInOtherProjectError,
} from '../../domain/admin-project-creation';
import { CreateProjectDTO } from '../dto/create-project.dto';
import { TutorSelectionDTO } from '../dto/set-project-tutors.dto';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import { ProjectApprovalEffects } from '../services/project-approval-effects.service';
import {
  PendingStudentInput,
  PreparedPendingStudent,
  ProjectEnrollmentService,
} from '../services/project-enrollment.service';
import { CreateProjectUC } from './create-project.uc';
import { ResolvedTutors, SetProjectTutorsUC } from './set-project-tutors.uc';
import { CheckActiveSubmissionByEmailsUC } from './check-active-submission-by-emails.uc';
import { eventTypeName } from './admin-change-project-state.uc';
import {
  INVITATION_COMMAND_PORT,
  InvitationCommandPort,
} from '../ports/invitation.command-port';

/** Role given to the students when they accept the invitation, as in the public submission */
const PARTICIPANT_ROLE_ID = 5;

export type AdminCreateState = 'APPROVED' | 'UNDER_REVIEW';

export interface AdminCreateProjectInput
  extends Omit<CreateProjectDTO, 'state'>, TutorSelectionDTO {
  actingUserId: number;
  /** APPROVED when left out */
  state?: AdminCreateState;
  participants: PendingStudentInput[];
  origin: AdminCreateOrigin;
}

export interface AdminCreateProjectResult {
  project: Project;
  participants: { email: string; status: StudentStatus }[];
  failedEffects: AdminCreateEffect[];
  /** Spanish warning for failedEffects, null when nothing failed */
  warning: string | null;
}

export const CREATE_EFFECTS_WARNING =
  'El proyecto se creó, pero no se completaron todos los pasos posteriores: ';

const EFFECT_TEXT: Record<AdminCreateEffect, string> = {
  DOCUMENTS: 'no se pudieron guardar los documentos',
  TUTOR_ACTIVATION: 'no se pudo activar a los tutores',
  INVITATION: 'no se pudo invitar a todos los integrantes pendientes',
  NOTIFICATION:
    'no se pudieron enviar todos los correos de aprobación a los integrantes pendientes',
};

/** Spanish warning listing the effects that failed, null when none did */
export const createEffectsWarning = (
  effects: AdminCreateEffect[],
): string | null =>
  effects.length
    ? `${CREATE_EFFECTS_WARNING}${effects.map((e) => EFFECT_TEXT[e]).join('; ')}.`
    : null;

const stackOf = (error: unknown) =>
  error instanceof Error ? error.stack : String(error);

/**
 * Creation of a project by an administrator (manage:projects), even after the inscription
 * deadline or in an event that is not publicly joinable; an event with published results is
 * closed (409). The name is unique in the event (409 PROJECT_NAME_TAKEN).
 *
 * Students with an account join directly; the others stay pending. A student already in
 * another project of the event that is not REJECTED is rejected (409
 * PARTICIPANT_IN_OTHER_PROJECT), under the same locks as an administrative addition.
 *
 * The project, its tutors, its participants and its CREATED change log entry are saved in one
 * transaction. Then each pending participant is invited to the project, as in the public
 * submission (accepting it is how they join). Created APPROVED, its tutors are activated and
 * its pending participants also get the approval email (and become INVITED); created
 * UNDER_REVIEW, both happen at the approval. A failure there does not undo the creation: it is
 * reported in failedEffects.
 */
@Injectable()
export class AdminCreateProjectUC {
  private readonly logger = new Logger(AdminCreateProjectUC.name);

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly createProject: CreateProjectUC,
    private readonly setProjectTutors: SetProjectTutorsUC,
    private readonly enrollment: ProjectEnrollmentService,
    private readonly activeSubmissions: CheckActiveSubmissionByEmailsUC,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    private readonly approvalEffects: ProjectApprovalEffects,
    @Inject(PROJECT_CHANGE_LOG_REPOSITORY)
    private readonly changeLog: ProjectChangeLogRepository,
    private readonly uow: UnitOfWork,
    @Inject(INVITATION_COMMAND_PORT)
    private readonly invitations: InvitationCommandPort,
  ) {}

  async execute(
    input: AdminCreateProjectInput,
  ): Promise<AdminCreateProjectResult> {
    const state = input.state ?? 'APPROVED';
    if (state !== 'APPROVED' && state !== 'UNDER_REVIEW') {
      throw new ValidationError(
        'El estado inicial del proyecto debe ser APPROVED o UNDER_REVIEW',
      );
    }
    const students = this.prepareStudents(input.participants ?? []);

    // Reads in other services, before the transaction
    const tutors = await this.setProjectTutors.resolve({
      tutorUserIds: input.tutorUserIds ?? [],
      pendingTutors: input.pendingTutors ?? [],
    });
    const accounts = await Promise.all(
      students.map((s) => this.auth.findUserByEmail(s.email)),
    );
    // Lists every conflicting email at once; the check under the locks still guards the race
    await this.assertNoneInOtherProject(
      input.eventId,
      students.map((s) => s.email),
    );

    const { project, participants } = await this.uow.run(async () => {
      const created = await this.createProject.execute(
        {
          eventId: input.eventId,
          courseId: input.courseId,
          name: input.name,
          projectCode: input.projectCode,
          description: input.description,
          eventNumber: input.eventNumber,
          state,
          nrc: input.nrc,
        },
        { administrative: true },
      );
      await this.setProjectTutors.store(created.id, tutors);

      const added: {
        email: string;
        status: StudentStatus;
        pending?: PendingProjectParticipant;
      }[] = [];
      for (const [i, student] of students.entries()) {
        const account = accounts[i];
        added.push(
          account
            ? await this.enroll(created, student, account.id)
            : await this.addPending(created, student),
        );
      }

      await this.changeLog.create({
        projectId: created.id,
        actorUserId: input.actingUserId,
        action: 'CREATED',
        before: {},
        after: this.createdValues(input, created, state, students, tutors),
        reason: null,
      });
      return { project: created, participants: added };
    });

    const failedEffects: AdminCreateEffect[] = [];
    let result = participants.map(({ email, status }) => ({ email, status }));
    const pendings = participants.flatMap((p) =>
      p.pending ? [p.pending] : [],
    );
    const eventType = eventTypeName(
      (await this.events.getEventById(project.eventId).catch(() => null)) as {
        eventType?: unknown;
      } | null,
    );
    if (
      !(await this.createInvitations(
        project,
        pendings,
        eventType,
        input.actingUserId,
      ))
    ) {
      failedEffects.push('INVITATION');
    }
    if (state === 'APPROVED') {
      if (!(await this.activateTutors(project, eventType))) {
        failedEffects.push('TUTOR_ACTIVATION');
      }
      const invited = await this.invitePendings(project, pendings, eventType);
      if (!invited.ok) failedEffects.push('NOTIFICATION');
      result = result.map((p) =>
        invited.emails.includes(p.email) ? { ...p, status: 'INVITED' } : p,
      );
    }
    return {
      project,
      participants: result,
      failedEffects,
      warning: createEffectsWarning(failedEffects),
    };
  }

  /** Validates every student and rejects an email or student code repeated in the request. */
  private prepareStudents(
    participants: PendingStudentInput[],
  ): PreparedPendingStudent[] {
    if (!participants.length) {
      throw new ValidationError('El proyecto necesita al menos un integrante');
    }
    const students = participants.map((p) => this.enrollment.preparePending(p));
    const repeated = (values: string[]) =>
      values.filter((v, i) => v && values.indexOf(v) !== i);
    const emails = repeated(students.map((s) => s.email));
    if (emails.length) {
      throw new ValidationError(
        `Hay correos repetidos entre los integrantes: ${[...new Set(emails)].join(', ')}`,
      );
    }
    const codes = repeated(students.map((s) => s.studentCode));
    if (codes.length) {
      throw new ValidationError(
        `Hay códigos de estudiante repetidos entre los integrantes: ${[...new Set(codes)].join(', ')}`,
      );
    }
    return students;
  }

  private async assertNoneInOtherProject(
    eventId: number,
    emails: string[],
  ): Promise<void> {
    const { conflicts } = await this.activeSubmissions.execute({
      eventId,
      emails,
    });
    if (conflicts.length) {
      throw new ParticipantInOtherProjectError(
        [...new Set(conflicts.map((c) => c.email))].sort(),
      );
    }
  }

  /** Inside uow.run. A student with an account joins the project directly. */
  private async enroll(
    project: Project,
    student: PreparedPendingStudent,
    userId: number,
  ) {
    const { studentCode } = this.enrollment.prepareEnrolled(
      userId,
      student.studentCode,
    );
    await this.inOtherProjectAs409(student.email, () =>
      this.enrollment.enroll(project, {
        userId,
        studentCode,
        email: student.email,
      }),
    );
    return { email: student.email, status: 'JOINED' as const };
  }

  /** Inside uow.run. A student without an account stays pending. */
  private async addPending(project: Project, student: PreparedPendingStudent) {
    const { pending } = await this.inOtherProjectAs409(student.email, () =>
      this.enrollment.addPending(project, student),
    );
    return { email: student.email, status: pending.status, pending };
  }

  /** The check under the locks reports one student; the answer has the same shape as the early check. */
  private async inOtherProjectAs409<T>(
    email: string,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof AdminParticipantsError &&
        error.rejection.code === 'PARTICIPANT_HAS_ACTIVE_PROJECT'
      ) {
        throw new ParticipantInOtherProjectError([email]);
      }
      throw error;
    }
  }

  private createdValues(
    input: AdminCreateProjectInput,
    project: Project,
    state: AdminCreateState,
    students: PreparedPendingStudent[],
    tutors: ResolvedTutors,
  ): Record<string, unknown> {
    const origin =
      input.origin.kind === 'ADMIN_BULK'
        ? {
            kind: 'ADMIN_BULK',
            fileName: input.origin.fileName,
            rowNumber: input.origin.rowNumber,
          }
        : { kind: 'ADMIN_FORM' };
    return {
      name: project.name,
      courseId: project.courseId,
      nrc: input.nrc?.trim() || null,
      projectCode: project.projectCode ?? null,
      state,
      participants: students.map((s) => s.email).sort(),
      tutors: {
        userIds: [...tutors.userIds].sort((a, b) => a - b),
        emails: tutors.pendings.map((p) => p.email).sort(),
      },
      origin,
    };
  }

  private async activateTutors(
    project: Project,
    eventType: string,
  ): Promise<boolean> {
    try {
      await this.approvalEffects.activateTutors(project.id, eventType);
      return true;
    } catch (error) {
      this.logger.error(
        `Tutor activation failed after the administrative creation of project ${project.id}`,
        stackOf(error),
      );
      return false;
    }
  }

  /** Invitation to the project for each pending participant; false when any of them failed. */
  private async createInvitations(
    project: Project,
    pendings: PendingProjectParticipant[],
    eventType: string,
    actingUserId: number,
  ): Promise<boolean> {
    let ok = true;
    for (const pending of pendings) {
      try {
        await this.invitations.createInvitation({
          email: pending.email,
          eventType,
          targetType: 'PROJECT',
          targetId: project.id,
          roleIds: [PARTICIPANT_ROLE_ID],
          firstName: pending.firstName,
          lastName: pending.lastName ?? '',
          requestedByUserId: actingUserId,
        });
      } catch (error) {
        this.logger.error(
          `Invitation of ${pending.email} failed after the administrative creation of project ${project.id}`,
          stackOf(error),
        );
        ok = false;
      }
    }
    return ok;
  }

  /** Sends the approval email to each pending participant and marks as INVITED those it reached. */
  private async invitePendings(
    project: Project,
    pendings: PendingProjectParticipant[],
    eventType: string,
  ): Promise<{ ok: boolean; emails: string[] }> {
    const sent: string[] = [];
    let ok = true;
    for (const pending of pendings) {
      try {
        const reached = await this.approvalEffects.notifyPendingParticipant(
          pending,
          { id: project.id, name: project.name },
          eventType,
        );
        if (reached) sent.push(pending.email);
        else ok = false;
      } catch (error) {
        this.logger.error(
          `Invitation email failed after the administrative creation of project ${project.id}`,
          stackOf(error),
        );
        ok = false;
      }
    }
    if (!sent.length) return { ok, emails: [] };
    try {
      await this.repo.markPendingsInvited(project.id, sent, new Date());
    } catch (error) {
      // The emails went out: the rows only stay PENDING
      this.logger.error(
        `Could not mark as invited the pending participants of project ${project.id}`,
        stackOf(error),
      );
      return { ok, emails: [] };
    }
    return { ok, emails: sent };
  }
}
