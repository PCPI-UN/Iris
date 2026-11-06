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

export function roundGrade(value: number): number {
    const factor = 10 ** GRADE_DECIMALS;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isFullWeight(totalWeight: number): boolean {
    return Math.abs(totalWeight - 1) <= WEIGHT_SUM_TOLERANCE;
}
