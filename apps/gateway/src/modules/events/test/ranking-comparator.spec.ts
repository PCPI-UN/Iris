import { EventService } from '../events.service';

/**
 * Ranking order (CU-86e3vmxar / IRIS-V3-EVAL-02).
 *
 * evaluation-service returns project averages rounded to 2 decimals, the same
 * precision shown in the Excel report, so two projects that look tied in the
 * report are tied for the comparator and the tiebreak order decides.
 */
describe('EventService ranking comparator', () => {
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

    it('uses the tiebreak order when the rounded averages are equal', () => {
        // Raw averages 85.334 and 85.33 both arrive as 85.33
        expect(
            sortRows([
                { projectId: 1, projectName: 'A', averageGrade: 85.33, tieBreakOrder: 2 },
                { projectId: 2, projectName: 'B', averageGrade: 85.33, tieBreakOrder: 1 },
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

    it('falls back to project id when name and grade are equal', () => {
        expect(
            sortRows([
                { projectId: 7, projectName: 'Alfa', averageGrade: 80 },
                { projectId: 3, projectName: 'alfa', averageGrade: 80 },
            ]),
        ).toEqual([3, 7]);
    });
});
