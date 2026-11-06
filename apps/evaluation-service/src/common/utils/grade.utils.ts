/**
 * Tolerance used when checking that a rubric's weights add up to 100%.
 * Weights are derived by dividing a component weight among its criteria
 * (e.g. 0.4 / 7), so their floating point sum is rarely exactly 1.
 */
export const WEIGHT_SUM_TOLERANCE = 1e-6;

/**
 * Number of decimals used for every grade stored or compared by IRIS
 * (evaluation grade, project average, ranking and reports).
 */
export const GRADE_DECIMALS = 2;

/**
 * Rounds half up to 2 decimals. The intermediate toFixed(6) drops floating
 * point noise first, so 11.685 and 11.684999999999999 (same sum in a different
 * order) both round to 11.69. Must stay identical to roundRankingGrade in the
 * gateway (apps/gateway/src/modules/events/ranking/ranking-positions.ts).
 */
export function roundGrade(value: number): number {
    const factor = 10 ** GRADE_DECIMALS;
    return Math.round(Number((value * factor).toFixed(6))) / factor;
}

export function isFullWeight(totalWeight: number): boolean {
    return Math.abs(totalWeight - 1) <= WEIGHT_SUM_TOLERANCE;
}
