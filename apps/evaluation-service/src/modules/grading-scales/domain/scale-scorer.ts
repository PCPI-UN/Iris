import { GradingScale, SystemScaleCode } from './grading-scale';

/**
 * Points that older versions stored for a level and that the scale no longer has. "Cero a cinco"
 * stored 1.5 for level 1 before it was aligned with the poster rubric (now 2); those evaluations
 * must still read back as level 1.
 */
const LEGACY_POINTS: Partial<Record<string, Record<string, number>>> = {
    [SystemScaleCode.ZERO_TO_FIVE]: { '1.5': 1 },
};

function pointsKey(points: number): string {
    return String(Math.round(points * 100) / 100);
}

/** Converts between the level a juror picks (1-4) and the points stored for it, for one scale. */
export class ScaleScorer {
    private readonly pointsByLevel = new Map<number, number>();
    private readonly levelByPoints = new Map<string, number>();

    constructor(readonly scale: GradingScale) {
        for (const level of scale.levels) {
            this.pointsByLevel.set(level.level, level.points);
            this.levelByPoints.set(pointsKey(level.points), level.level);
        }

        const legacy = scale.code ? LEGACY_POINTS[scale.code] : undefined;
        for (const [points, level] of Object.entries(legacy ?? {})) {
            if (!this.levelByPoints.has(points)) {
                this.levelByPoints.set(points, level);
            }
        }
    }

    /** Levels the juror can pick, in order. */
    get levels(): number[] {
        return [...this.pointsByLevel.keys()].sort((a, b) => a - b);
    }

    /** Points of a level, or `undefined` when the scale has no such level. */
    pointsFor(level: number): number | undefined {
        return this.pointsByLevel.get(level);
    }

    /** Level a stored score belongs to, or `undefined` when the score is not a value of this scale. */
    levelFor(points: number): number | undefined {
        if (typeof points !== 'number' || !Number.isFinite(points)) {
            return undefined;
        }
        return this.levelByPoints.get(pointsKey(points));
    }
}
