// Bogota has no daylight saving time: always UTC-5
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

/**
 * Academic semester of a date, using the university convention:
 * `AAAA-10` from January to June and `AAAA-30` from July to December.
 * The date is read in Bogota time, so an event that starts on 30 June at night
 * stays in the first semester even though it is already July in UTC.
 * Returns null when the date is missing or invalid.
 */
export function semesterOf(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  const bogota = new Date(parsed.getTime() + BOGOTA_OFFSET_MS);
  const year = bogota.getUTCFullYear();
  const period = bogota.getUTCMonth() < 6 ? '10' : '30';
  return `${year}-${period}`;
}
