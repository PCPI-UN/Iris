import { DomainError } from './errors';
import {
  PendingProjectParticipant,
  ProjectParticipant,
} from './entities/project.entity';

/**
 * Why an administrative change of the participants was rejected (nothing changed):
 * - PARTICIPANT_HAS_ACTIVE_PROJECT (409): the student already takes part in another project of
 *   the event that is not REJECTED
 * - PARTICIPANT_ALREADY_IN_PROJECT (409): the student is already a participant of this project
 * - LAST_PARTICIPANT (400): the project would be left without participants
 */
export type AdminParticipantsErrorCode =
  | 'PARTICIPANT_HAS_ACTIVE_PROJECT'
  | 'PARTICIPANT_ALREADY_IN_PROJECT'
  | 'LAST_PARTICIPANT';

export interface AdminParticipantsRejection {
  code: AdminParticipantsErrorCode;
  /** Spanish message for the user */
  message: string;
  /** The student's email, when known */
  email?: string;
  /** PARTICIPANT_HAS_ACTIVE_PROJECT: the other project of the event */
  projectId?: number;
  /** The enrolled student, when the request named one */
  userId?: number;
}

/** The change was not applied; carries the cause so the client can tell them apart. */
export class AdminParticipantsError extends DomainError {
  constructor(readonly rejection: AdminParticipantsRejection) {
    super(rejection.message);
  }
}

export const participantHasActiveProject = (
  email: string,
  projectId: number,
  userId?: number,
) =>
  new AdminParticipantsError({
    code: 'PARTICIPANT_HAS_ACTIVE_PROJECT',
    email,
    projectId,
    userId,
    message: `El estudiante ${email} ya participa en otro proyecto activo de este evento (proyecto ${projectId}). Quítalo de ese proyecto antes de agregarlo aquí.`,
  });

export const participantAlreadyInProject = (email: string, userId?: number) =>
  new AdminParticipantsError({
    code: 'PARTICIPANT_ALREADY_IN_PROJECT',
    email,
    userId,
    message: `El estudiante ${email} ya es integrante de este proyecto.`,
  });

/** Another participant of the project (enrolled, or pending not joined) has that student code. */
export const studentCodeAlreadyInProject = (
  email: string,
  studentCode: string,
) =>
  new AdminParticipantsError({
    code: 'PARTICIPANT_ALREADY_IN_PROJECT',
    email,
    message: `Ya hay un integrante con el código de estudiante ${studentCode} en este proyecto: es el mismo estudiante aunque tenga otro correo.`,
  });

export const lastParticipant = () =>
  new AdminParticipantsError({
    code: 'LAST_PARTICIPANT',
    message:
      'No se puede quitar al único integrante del proyecto. Agrega otro integrante antes de quitar este.',
  });

/** Participant as stored in a PARTICIPANTS entry of the change log. */
export type ParticipantLogValue =
  | {
      type: 'ENROLLED';
      userId: number;
      studentCode: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | {
      type: 'PENDING';
      pendingId: number | null;
      firstName: string;
      lastName: string | null;
      email: string;
      studentCode: string;
      semester: string;
      career: string;
    };

export const enrolledLogValue = (
  participant: ProjectParticipant,
  account: { email?: string; firstName?: string; lastName?: string } | null,
): ParticipantLogValue => ({
  type: 'ENROLLED',
  userId: participant.userId,
  studentCode: participant.studentCode,
  email: account?.email ?? null,
  firstName: account?.firstName ?? null,
  lastName: account?.lastName ?? null,
});

export const pendingLogValue = (
  pending: PendingProjectParticipant,
): ParticipantLogValue => ({
  type: 'PENDING',
  pendingId: pending.pendingId ?? null,
  firstName: pending.firstName,
  lastName: pending.lastName ?? null,
  email: pending.email,
  studentCode: pending.studentCode,
  semester: pending.semester,
  career: pending.career,
});

/**
 * People in the project: the enrolled participants plus the pending ones that have not joined.
 * A JOINED pending row is the same person as an enrolled participant, so it is not counted twice.
 */
export const countMembers = (
  participants: ProjectParticipant[],
  pendings: PendingProjectParticipant[],
): number =>
  participants.length + pendings.filter((p) => p.status !== 'JOINED').length;
