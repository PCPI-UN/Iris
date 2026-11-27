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
