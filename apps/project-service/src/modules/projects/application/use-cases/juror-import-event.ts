import { status } from '@grpc/grpc-js';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { EventServicePort } from '../ports/event-service.port';

/** The event fields the juror import uses */
export interface JurorImportEvent {
  name?: string;
  active?: boolean;
  endDate?: string;
}

/** Loads the event of a juror import; a missing event is a NotFoundError */
export async function getJurorImportEvent(
  events: EventServicePort,
  eventId: number,
): Promise<JurorImportEvent> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new ValidationError('eventId debe ser un entero positivo');
  }
  try {
    const event = (await events.getEventById(
      eventId,
    )) as JurorImportEvent | null;
    if (!event) throw new NotFoundError(`El evento ${eventId} no existe.`);
    return event;
  } catch (error) {
    if ((error as { code?: number })?.code === status.NOT_FOUND) {
      throw new NotFoundError(`El evento ${eventId} no existe.`);
    }
    throw error;
  }
}
