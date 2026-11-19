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
        return ['la escala de calificación es obligatoria'];
    }

    const problems: string[] = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';

    if (!name) {
        problems.push('el nombre es obligatorio');
    } else if (name.length > MAX_SCALE_NAME_LENGTH) {
        problems.push(`el nombre puede tener como máximo ${MAX_SCALE_NAME_LENGTH} caracteres`);
    }

    const levels = Array.isArray(input.levels) ? input.levels : [];

    if (levels.length !== GRADING_SCALE_LEVELS) {
        problems.push(`una escala de calificación debe tener exactamente ${GRADING_SCALE_LEVELS} niveles (recibió ${levels.length})`);
        return problems;
    }

    const numbers = levels.map((level) => level?.level);
    const expected = Array.from({ length: GRADING_SCALE_LEVELS }, (_, index) => index + 1);
    if (!expected.every((level) => numbers.filter((number) => number === level).length === 1)) {
        problems.push(`los niveles deben ir numerados del 1 al ${GRADING_SCALE_LEVELS}, cada uno una vez`);
        return problems;
    }

    const sorted = sortLevels(levels);

    for (const level of sorted) {
        const label = typeof level.label === 'string' ? level.label.trim() : '';
        if (!label) {
            problems.push(`el nivel ${level.level} necesita una etiqueta`);
        } else if (label.length > MAX_LEVEL_LABEL_LENGTH) {
            problems.push(`la etiqueta del nivel ${level.level} puede tener como máximo ${MAX_LEVEL_LABEL_LENGTH} caracteres`);
        }

        if (typeof level.points !== 'number' || !Number.isFinite(level.points)) {
            problems.push(`el nivel ${level.level} necesita puntos numéricos`);
        } else if (level.points < 0 || level.points > MAX_LEVEL_POINTS) {
            problems.push(`los puntos del nivel ${level.level} deben estar entre 0 y ${MAX_LEVEL_POINTS}`);
        } else if (!hasAtMostTwoDecimals(level.points)) {
            problems.push(`los puntos del nivel ${level.level} pueden tener como máximo 2 decimales`);
        }
    }

    if (problems.length > 0) {
        return problems;
    }

    for (let index = 1; index < sorted.length; index++) {
        if (sorted[index].points <= sorted[index - 1].points) {
            problems.push(
                `los puntos deben crecer del nivel 1 al nivel ${GRADING_SCALE_LEVELS}: ` +
                `el nivel ${sorted[index].level} (${sorted[index].points}) no es mayor que ` +
                `el nivel ${sorted[index - 1].level} (${sorted[index - 1].points})`,
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
