export { GRADE_DECIMALS, roundGrade } from '@app/common/utils/grade-rounding';

/**
 * Tolerance used when checking that weights add up to 100%. Effective weights
 * come from dividing a component weight among its criteria (e.g. 0.4 / 7), so
 * their floating point sum is rarely exactly 1.
 */
export const WEIGHT_SUM_TOLERANCE = 1e-6;

export function isFullWeight(totalWeight: number): boolean {
    return Math.abs(totalWeight - 1) <= WEIGHT_SUM_TOLERANCE;
}
