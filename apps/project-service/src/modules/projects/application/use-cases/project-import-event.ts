import { EventServicePort } from '../ports/event-service.port';
import { getJurorImportEvent } from './juror-import-event';

/** The event fields the project import uses */
export interface ProjectImportEvent {
  name?: string;
  active?: boolean;
  resultsPublished?: boolean;
  /** Only false means the NRC is not needed, as in CreateProjectUC */
  requiresCourse?: boolean;
  termId?: number;
}

/** Loads the event of a project import; a missing event is a NotFoundError */
export function getProjectImportEvent(
  events: EventServicePort,
  eventId: number,
): Promise<ProjectImportEvent> {
  // Same lookup as the juror import; the event carries every field, read here by this type
  return getJurorImportEvent(events, eventId);
}

/** Same reading as CreateProjectUC: only an explicit false drops the NRC */
export const eventRequiresCourse = (event: ProjectImportEvent): boolean =>
  event.requiresCourse !== false;
