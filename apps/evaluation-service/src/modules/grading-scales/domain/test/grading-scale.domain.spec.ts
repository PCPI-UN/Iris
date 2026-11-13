import { EvaluationType } from '@app/common/generated/event';
import { normalizeGradingScaleInput, validateGradingScaleInput } from '../grading-scale.rules';
import { ScaleScorer } from '../scale-scorer';
import { systemScaleCodeFor } from '../legacy-evaluation-type';
import { SystemScaleCode } from '../grading-scale';
import { customScale, systemScales } from '../../testing/grading-scales.fixture';

const levels = (points: number[], labels = ['Insuficiente', 'Aceptable', 'Bueno', 'Excelente']) =>
    points.map((value, index) => ({ level: index + 1, label: labels[index], points: value }));

describe('validateGradingScaleInput', () => {
    it('accepts a 4-level scale whose points grow', () => {
        expect(validateGradingScaleInput({ name: 'Decenas', levels: levels([10, 20, 30, 40]) })).toEqual([]);
    });

    it('accepts levels sent in any order and points with 2 decimals', () => {
        const input = { name: 'Decimal', levels: levels([0, 1.25, 2.5, 3.75]).reverse() };

        expect(validateGradingScaleInput(input)).toEqual([]);
        expect(normalizeGradingScaleInput(input).levels.map((level) => level.level)).toEqual([1, 2, 3, 4]);
    });

    it.each([
        [[10, 20, 30]],
        [[10, 20, 30, 40, 50]],
        [[]],
    ])('rejects a scale without exactly 4 levels (%p)', (points) => {
        expect(validateGradingScaleInput({ name: 'X', levels: levels(points) })).toEqual([
            expect.stringContaining('exactly 4 levels'),
        ]);
    });

    it.each([
        [[10, 20, 20, 40], 'level 3 (20) is not greater than level 2 (20)'],
        [[40, 30, 20, 10], 'level 2 (30) is not greater than level 1 (40)'],
    ])('rejects points that do not grow (%p)', (points, message) => {
        expect(validateGradingScaleInput({ name: 'X', levels: levels(points) }).join('; ')).toContain(message);
    });

    it('rejects repeated or out-of-range level numbers', () => {
        const input = { name: 'X', levels: [1, 2, 2, 5].map((level) => ({ level, label: 'L', points: level })) };

        expect(validateGradingScaleInput(input)).toEqual([expect.stringContaining('numbered 1 to 4')]);
    });

    it('rejects an empty name, empty labels, negative points and more than 2 decimals', () => {
        const problems = validateGradingScaleInput({
            name: '  ',
            levels: [
                { level: 1, label: ' ', points: -1 },
                { level: 2, label: 'B', points: 1.005 },
                { level: 3, label: 'C', points: 3 },
                { level: 4, label: 'D', points: 4 },
            ],
        });

        expect(problems).toEqual(
            expect.arrayContaining([
                'name is required',
                'level 1 needs a label',
                expect.stringContaining('the points of level 1 must be between 0'),
                'the points of level 2 can have at most 2 decimals',
            ]),
        );
    });

    it('rejects a missing scale', () => {
        expect(validateGradingScaleInput(undefined)).toEqual(['the grading scale is required']);
    });
});

describe('ScaleScorer', () => {
    const [finalProjects, zeroToFive, zeroToHundred] = systemScales();

    it.each([
        [finalProjects, [25, 55, 75, 90]],
        [zeroToFive, [2, 3, 4, 5]],
        [zeroToHundred, [40, 60, 80, 100]],
    ])('gives the points of every level of system scale %#', (scale, points) => {
        const scorer = new ScaleScorer(scale);

        expect([1, 2, 3, 4].map((level) => scorer.pointsFor(level))).toEqual(points);
        expect(points.map((value) => scorer.levelFor(value))).toEqual([1, 2, 3, 4]);
    });

    it('has no points for a level outside 1-4', () => {
        const scorer = new ScaleScorer(finalProjects);

        expect(scorer.pointsFor(0)).toBeUndefined();
        expect(scorer.pointsFor(5)).toBeUndefined();
    });

    it('still reads the legacy 1.5 of "Cero a cinco" as level 1', () => {
        expect(new ScaleScorer(zeroToFive).levelFor(1.5)).toBe(1);
        expect(new ScaleScorer(finalProjects).levelFor(1.5)).toBeUndefined();
    });

    it('matches stored points by their 2-decimal value', () => {
        const scorer = new ScaleScorer(customScale(9, [0.1, 0.2, 0.3, 0.45]));

        expect(scorer.levelFor(0.1 + 0.2)).toBe(3);
        expect(scorer.levelFor(0.33)).toBeUndefined();
    });
});

describe('systemScaleCodeFor', () => {
    it.each([
        [EvaluationType.FINAL_PROJECTS, SystemScaleCode.FINAL_PROJECTS],
        [EvaluationType.ZERO_TO_FIVE, SystemScaleCode.ZERO_TO_FIVE],
        [EvaluationType.ZERO_TO_HUNDRED, SystemScaleCode.ZERO_TO_HUNDRED],
        ['ZERO_TO_FIVE', SystemScaleCode.ZERO_TO_FIVE],
        ['ZERO_TO_HUNDRED', SystemScaleCode.ZERO_TO_HUNDRED],
        [EvaluationType.EVALUATION_TYPE_UNSPECIFIED, SystemScaleCode.FINAL_PROJECTS],
        [undefined, SystemScaleCode.FINAL_PROJECTS],
        ['UNKNOWN', SystemScaleCode.FINAL_PROJECTS],
    ])('maps %p to %p', (evaluationType, code) => {
        expect(systemScaleCodeFor(evaluationType)).toBe(code);
    });
});
