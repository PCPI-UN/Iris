import { isFullWeight, roundGrade } from './grade.utils';

describe('grade utils', () => {
    it.each([
        [81.171428, 81.17],
        [83.250714, 83.25],
        [11.685, 11.69],
        [11.684999999999999, 11.69],
        [88.11, 88.11],
        [0, 0],
    ])('roundGrade(%p) = %p', (value, expected) => {
        expect(roundGrade(value)).toBe(expected);
    });

    it('accepts weights derived from 30/40/30 components as 100%', () => {
        const total = [...Array(5).fill(0.3 / 5), ...Array(7).fill(0.4 / 7), ...Array(3).fill(0.1)]
            .reduce((sum, weight) => sum + weight, 0);

        expect(isFullWeight(total)).toBe(true);
    });

    it('rejects the 0.979 rubric of the approved report', () => {
        expect(isFullWeight(0.979)).toBe(false);
    });
});
