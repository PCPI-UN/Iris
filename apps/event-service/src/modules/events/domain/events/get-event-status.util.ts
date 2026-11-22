import { EventStatus } from './event-status.enum';
import { isInscriptionDeadlinePassed } from '@app/common/utils/bogota-date.util';

export const getEventStatus = (
  start: Date | string,
  end: Date | string,
  inscriptionDeadline?: Date | string | null,
): EventStatus => {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  const now = new Date();

  // Event has ended
  if (now > endDate) {
    return EventStatus.CLOSED;
  }

  // Event is currently happening
  if (now >= startDate && now <= endDate) {
    return EventStatus.AVAILABLE;
  }

  // Event hasn't started yet (now < start, checked above): check the registration deadline.
  // The deadline day is read in Bogotá time (the container runs in UTC) and counts in full.
  // The start is compared by its exact instant, as PrismaEventRepository filters it.
  if (
    inscriptionDeadline &&
    isInscriptionDeadlinePassed(inscriptionDeadline, now)
  ) {
    return EventStatus.REGISTRATION_CLOSED;
  }

  // Registrations still open, event hasn't started
  return EventStatus.UPCOMING;
};
