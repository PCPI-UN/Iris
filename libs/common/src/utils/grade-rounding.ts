/**
 * Number of decimals used for every grade stored, compared or shown by IRIS
 * (evaluation grade, project average, ranking positions and reports).
 */
export const GRADE_DECIMALS = 2;

/**
 * Rounds half up to 2 decimals. The intermediate toFixed(6) drops floating
 * point noise first, so 11.685 and 11.684999999999999 (same sum in a different
 * order) both round to 11.69.
 *
 * Shared by evaluation-service (stored grades and averages) and the gateway
 * (ranking positions), so both always produce the same value.
 */
export function roundGrade(grade: number): number {
  const factor = 10 ** GRADE_DECIMALS;
  return Math.round(Number((grade * factor).toFixed(6))) / factor;
}
