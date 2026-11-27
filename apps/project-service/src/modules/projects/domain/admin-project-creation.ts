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
