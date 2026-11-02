import { EventService } from '../events.service';

/**
 * Characterization tests (CU-86e3vmxar / IRIS-V3-EVAL-02) for the ranking order.
 *
 * The ranking compares the raw floating point averages, while the Excel report
 * shows them rounded to 2 decimals. Each test that documents a defect carries
 * an "After fix" note with the target behavior.
 */
describe('EventService ranking comparator - characterization', () => {
    type Row = {
        projectId: number;
        projectName: string;
        averageGrade: number;
        tieBreakOrder?: number;
    };

    // compareRankingRows does not use instance state, so it can be exercised from the prototype.
    const compare = (a: Row, b: Row): number =>
        (EventService.prototype as unknown as {
            compareRankingRows(a: Row, b: Row): number;
        }).compareRankingRows(a, b);

    const sortRows = (rows: Row[]) => [...rows].sort(compare).map((r) => r.projectId);

    it('orders by average grade descending', () => {
        expect(
            sortRows([
                { projectId: 1, projectName: 'A', averageGrade: 78.79 },
                { projectId: 2, projectName: 'B', averageGrade: 85.8 },
                { projectId: 3, projectName: 'C', averageGrade: 84.19 },
            ]),
        ).toEqual([2, 3, 1]);
    });

    it('uses the tiebreak order when averages are exactly equal', () => {
        expect(
            sortRows([
                { projectId: 1, projectName: 'A', averageGrade: 80, tieBreakOrder: 2 },
                { projectId: 2, projectName: 'B', averageGrade: 80, tieBreakOrder: 1 },
            ]),
        ).toEqual([2, 1]);
    });

    it('falls back to project name when tied without tiebreak', () => {
        expect(
            sortRows([
                { projectId: 1, projectName: 'Zeta', averageGrade: 80 },
                { projectId: 2, projectName: 'Alfa', averageGrade: 80 },
            ]),
        ).toEqual([2, 1]);
    });

    it('CURRENT: two averages that display the same with 2 decimals are not treated as a tie', () => {
        // 85.334 and 85.33 are both exported as 85.33, but the ranking orders them by the hidden decimals
        // and ignores the tiebreak record, so the report shows a tie that was never resolved by a tiebreak.
        // After fix: compare the rounded grade, so the tiebreak decides.
        const rows: Row[] = [
            { projectId: 1, projectName: 'A', averageGrade: 85.33, tieBreakOrder: 1 },
            { projectId: 2, projectName: 'B', averageGrade: 85.334, tieBreakOrder: 2 },
        ];

        expect(Number(rows[0].averageGrade.toFixed(2))).toBe(Number(rows[1].averageGrade.toFixed(2)));
        expect(sortRows(rows)).toEqual([2, 1]);
    });

    it('CURRENT: floating point noise from different summation orders breaks a mathematical tie', () => {
        // Same weights and scores, summed in a different order, produce different doubles.
        // After fix: grades are rounded before being compared (or stored rounded).
        const gradeA = 0.057 * 90 + 0.057 * 90 + 0.057 * 25; // 11.685
        const gradeB = 0.057 * 25 + 0.057 * 90 + 0.057 * 90; // 11.684999999999999

        expect(gradeA).not.toBe(gradeB);
        // Project 2 has the better tiebreak order, but loses on floating point noise.
        expect(
            sortRows([
                { projectId: 1, projectName: 'A', averageGrade: gradeA, tieBreakOrder: 2 },
                { projectId: 2, projectName: 'B', averageGrade: gradeB, tieBreakOrder: 1 },
            ]),
        ).toEqual([1, 2]);
    });
});
