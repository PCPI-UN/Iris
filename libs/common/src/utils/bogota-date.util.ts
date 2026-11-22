import { DateTime } from 'luxon';

/**
 * Iris runs for a university in Colombia: every calendar day the users see (deadlines,
 * event dates) is a day in Bogotá. The containers run in UTC, so a day must never be read
 * with the local getters of `Date` (getDate, getMonth...), which answer in the zone of the
 * server.
 */
export const BOGOTA_ZONE = 'America/Bogota';

/** The calendar day of an instant in Bogotá, as `YYYY-MM-DD`. */
export function bogotaDay(instant: Date | string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return DateTime.fromJSDate(date, { zone: BOGOTA_ZONE }).toISODate() as string;
}

/** The instant the current day starts in Bogotá (00:00 America/Bogota). */
export function startOfBogotaDay(now: Date = new Date()): Date {
  return DateTime.fromJSDate(now, { zone: BOGOTA_ZONE }).startOf('day').toJSDate();
}

/**
 * Whether an inscription deadline has passed. The deadline day counts in full: inscriptions
 * stay open until 23:59:59 of that day in Bogotá, whatever the hour stored with it and
 * whatever the zone of the server.
 */
export function isInscriptionDeadlinePassed(
  deadline: Date | string,
  now: Date = new Date(),
): boolean {
  return bogotaDay(deadline) < bogotaDay(now);
}
