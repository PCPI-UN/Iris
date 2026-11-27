import { ConflictError } from './errors';

/** An event that published its results is closed: not even an administrator adds projects to it. */
export class EventResultsPublishedError extends ConflictError {
  readonly code = 'EVENT_RESULTS_PUBLISHED';

  constructor() {
    super(
      'El evento ya publicó sus resultados: no se le pueden crear proyectos',
    );
  }
}

/** The name is unique per event, in any category (the database constraint is on event and name). */
export class ProjectNameTakenError extends ConflictError {
  readonly code = 'PROJECT_NAME_TAKEN';

  constructor(name: string) {
    super(`Ya existe un proyecto llamado "${name}" en este evento`);
  }
}

/** Students already in another project of the event that is not REJECTED. */
export class ParticipantInOtherProjectError extends ConflictError {
  readonly code = 'PARTICIPANT_IN_OTHER_PROJECT';

  constructor(readonly emails: string[]) {
    super(
      `Estos integrantes ya están en otro proyecto del evento: ${emails.join(', ')}`,
    );
  }
}

/** Where an administrative creation came from, kept in its CREATED change log entry */
export type AdminCreateOrigin =
  | { kind: 'ADMIN_FORM' }
  | { kind: 'ADMIN_BULK'; fileName: string; rowNumber: number };

/**
 * Work done after the project is saved. Its failure does not undo the creation: the answer
 * lists it so the user knows what to retry.
 * - DOCUMENTS: upload and association of the files (gateway)
 * - TUTOR_ACTIVATION: Tutor role and invitations of the tutors (created APPROVED)
 * - NOTIFICATION: approval email to the pending participants (created APPROVED)
 */
export type AdminCreateEffect =
  'DOCUMENTS' | 'TUTOR_ACTIVATION' | 'NOTIFICATION';
