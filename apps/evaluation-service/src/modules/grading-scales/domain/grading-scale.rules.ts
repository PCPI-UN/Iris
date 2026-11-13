import {
    GRADING_SCALE_LEVELS,
    GradingScaleInput,
    GradingScaleLevel,
    MAX_LEVEL_LABEL_LENGTH,
    MAX_LEVEL_POINTS,
    MAX_SCALE_NAME_LENGTH,
} from './grading-scale';

function hasAtMostTwoDecimals(value: number): boolean {
    return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

/**
 * Checks a scale before it is saved and returns every problem found (empty when it is valid):
 * a name, exactly 4 levels numbered 1 to 4 once each, a label per level, and points that are
 * non-negative, have at most 2 decimals and grow strictly from level 1 to level 4.
 */
export function validateGradingScaleInput(input: GradingScaleInput | undefined | null): string[] {
    if (!input) {
        return ['the grading scale is required'];
    }

    const problems: string[] = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';

    if (!name) {
        problems.push('name is required');
    } else if (name.length > MAX_SCALE_NAME_LENGTH) {
        problems.push(`name must be at most ${MAX_SCALE_NAME_LENGTH} characters`);
    }

    const levels = Array.isArray(input.levels) ? input.levels : [];

    if (levels.length !== GRADING_SCALE_LEVELS) {
        problems.push(`a grading scale must have exactly ${GRADING_SCALE_LEVELS} levels (received ${levels.length})`);
        return problems;
    }

    const numbers = levels.map((level) => level?.level);
    const expected = Array.from({ length: GRADING_SCALE_LEVELS }, (_, index) => index + 1);
    if (!expected.every((level) => numbers.filter((number) => number === level).length === 1)) {
        problems.push(`levels must be numbered 1 to ${GRADING_SCALE_LEVELS}, each one once`);
        return problems;
    }

    const sorted = sortLevels(levels);

    for (const level of sorted) {
        const label = typeof level.label === 'string' ? level.label.trim() : '';
        if (!label) {
            problems.push(`level ${level.level} needs a label`);
        } else if (label.length > MAX_LEVEL_LABEL_LENGTH) {
            problems.push(`the label of level ${level.level} must be at most ${MAX_LEVEL_LABEL_LENGTH} characters`);
        }

        if (typeof level.points !== 'number' || !Number.isFinite(level.points)) {
            problems.push(`level ${level.level} needs numeric points`);
        } else if (level.points < 0 || level.points > MAX_LEVEL_POINTS) {
            problems.push(`the points of level ${level.level} must be between 0 and ${MAX_LEVEL_POINTS}`);
        } else if (!hasAtMostTwoDecimals(level.points)) {
            problems.push(`the points of level ${level.level} can have at most 2 decimals`);
        }
    }

    if (problems.length > 0) {
        return problems;
    }

    for (let index = 1; index < sorted.length; index++) {
        if (sorted[index].points <= sorted[index - 1].points) {
            problems.push(
                `points must grow from level 1 to level ${GRADING_SCALE_LEVELS}: ` +
                `level ${sorted[index].level} (${sorted[index].points}) is not greater than ` +
                `level ${sorted[index - 1].level} (${sorted[index - 1].points})`,
            );
        }
    }

    return problems;
}

export function sortLevels(levels: GradingScaleLevel[]): GradingScaleLevel[] {
    return [...levels].sort((a, b) => a.level - b.level);
}

/** Trimmed copy of a valid input, with the levels sorted and the points rounded to 2 decimals. */
export function normalizeGradingScaleInput(input: GradingScaleInput): GradingScaleInput {
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    return {
        name: input.name.trim(),
        description: description || null,
        levels: sortLevels(input.levels).map((level) => ({
            level: level.level,
            label: level.label.trim(),
            points: Math.round(level.points * 100) / 100,
        })),
    };
}
