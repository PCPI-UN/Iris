import { Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { normalizeEmail } from '@app/common/utils/email.util';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PendingProjectParticipant,
  Project,
  ProjectParticipant,
  ProjectState,
} from '../../domain/entities/project.entity';
import { ValidationError } from '../../domain/errors';
import {
  participantAlreadyInProject,
  participantHasActiveProject,
  studentCodeAlreadyInProject,
} from '../../domain/admin-participants';
import { AddParticipantUC } from '../use-cases/add-participant.uc';
import { AddPendingParticipantUC } from '../use-cases/add-pending-participant.us';
import { CheckActiveSubmissionByEmailsUC } from '../use-cases/check-active-submission-by-emails.uc';

/** States in which a project keeps its participants busy in the event */
const ACTIVE_STATES: ProjectState[] = [
  'UNDER_REVIEW',
  'APPROVED',
  'REQUEST_CHANGES',
];

export interface PendingStudentInput {
  firstName: string;
  lastName?: string | null;
  email: string;
  studentCode: string;
  semester: string;
  career: string;
}

/** A pending student with the name, email and student code trimmed and the email normalized */
export interface PreparedPendingStudent {
  firstName: string;
  lastName: string | null;
  email: string;
  studentCode: string;
  semester: string;
  career: string;
}

/**
 * Adds a student to a project as an administrator does: an enrolled participant (a platform
 * user) or a pending one (a student without an account). A student already in the project, or
 * in another project of the event that is not REJECTED, is rejected with an
 * AdminParticipantsError (409).
 *
 * `enroll` and `addPending` run inside `UnitOfWork.run`: they lock the project and the student
 * in the event, so two concurrent additions cannot both pass the checks. They write no change
 * log entry; the caller records it in the same transaction.
 */
@Injectable()
export class ProjectEnrollmentService {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly addParticipant: AddParticipantUC,
    private readonly addPendingParticipant: AddPendingParticipantUC,
    private readonly activeSubmissions: CheckActiveSubmissionByEmailsUC,
  ) {}

  /** Validates the enrolled participant before the transaction: a user id and a student code. */
  prepareEnrolled(
    userId: number,
    studentCode: string | undefined,
  ): { userId: number; studentCode: string } {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError('El ID de usuario del integrante no es válido');
    }
    const code = studentCode?.trim();
    if (!code) {
      throw new ValidationError('El código de estudiante es obligatorio');
    }
    return { userId, studentCode: code };
  }

  /** Validates the name and the email of a pending student before the transaction. */
  preparePending(pending: PendingStudentInput): PreparedPendingStudent {
    const firstName = pending.firstName?.trim();
    if (!firstName) {
      throw new ValidationError('El nombre del integrante es obligatorio');
    }
    const email = normalizeEmail(pending.email ?? '');
    if (!isEmail(email)) {
      throw new ValidationError('El formato del correo no es válido');
    }
    return {
      firstName,
      lastName: pending.lastName?.trim() || null,
      email,
      studentCode: pending.studentCode?.trim(),
      semester: pending.semester,
      career: pending.career,
    };
  }

  /**
   * Inside uow.run. Saves a platform user as a participant of the project, with their email
   * (normalized) read from auth-service before the transaction.
   */
  async enroll(
    project: Project,
    student: { userId: number; studentCode: string; email: string },
  ): Promise<ProjectParticipant> {
    const { userId, studentCode, email } = student;
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
    return saved;
  }

  /**
   * Inside uow.run. Saves a pending participant; `accountId` is the platform user with that
   * email, read before the transaction, if there is one. Returns the row and the project as read
   * under the lock, before saving: its state is the one the invitation depends on.
   */
  async addPending(
    project: Project,
    pending: PreparedPendingStudent,
    accountId?: number,
  ): Promise<{ pending: PendingProjectParticipant; project: Project }> {
    const { email, studentCode } = pending;
    // The checks run under the locks, so a concurrent addition cannot slip past them
    await this.lockStudent(project, email);
    const current = (await this.repo.findById(project.id)) ?? project;
    const pendings = await this.repo.listPendingParticipants(project.id);
    const participants = await this.repo.listParticipants(project.id);
    // Rows saved before emails were normalized may differ in case or spaces
    if (pendings.some((p) => normalizeEmail(p.email) === email)) {
      throw participantAlreadyInProject(email);
    }
    if (
      accountId !== undefined &&
      participants.some((p) => p.userId === accountId)
    ) {
      throw participantAlreadyInProject(email, accountId);
    }
    // The same student code is the same student, even under another email: an enrolled
    // participant, or a pending one who has not joined (a joined row is an enrolled one)
    if (
      studentCode &&
      (participants.some((p) => p.studentCode?.trim() === studentCode) ||
        pendings.some(
          (p) => p.status !== 'JOINED' && p.studentCode?.trim() === studentCode,
        ))
    ) {
      throw studentCodeAlreadyInProject(email, studentCode);
    }
    await this.assertNotInOtherProject(project, email, accountId);

    // Validates the email, code, semester and career; the email is not in the project
    // (checked above, under the lock), so this creates the row
    const row = await this.addPendingParticipant.execute({
      projectId: project.id,
      firstName: pending.firstName,
      lastName: pending.lastName,
      email,
      studentCode,
      semester: pending.semester,
      career: pending.career,
      status: 'PENDING',
    });
    return { pending: row, project: current };
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
}
