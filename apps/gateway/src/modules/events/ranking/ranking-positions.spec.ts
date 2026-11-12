import {
  assignRankingPositions,
  filterVisiblePositions,
} from './ranking-positions';
import { roundGrade } from '@app/common/utils/grade-rounding';

describe('ranking positions (co-winners)', () => {
  const row = (projectId: number, averageGrade: number) => ({
    projectId,
    averageGrade,
    position: 0,
  });

  const positions = (rows: ReturnType<typeof row>[]) =>
    assignRankingPositions(rows).map((r) => [r.projectId, r.position]);

  it('orders by average descending with consecutive positions when there are no ties', () => {
    expect(positions([row(1, 78.79), row(2, 85.8), row(3, 84.19)])).toEqual([
      [2, 1],
      [3, 2],
      [1, 3],
    ]);
  });

  it('gives the same position to projects with the same average', () => {
    expect(positions([row(1, 80), row(2, 90), row(3, 90)])).toEqual([
      [2, 1],
      [3, 1],
      [1, 2],
    ]);
  });

  it('uses dense positions after a tie (1, 1, 2, 2, 2, 3)', () => {
    expect(
      positions([
        row(1, 90),
        row(2, 90),
        row(3, 85),
        row(4, 85),
        row(5, 85),
        row(6, 70),
      ]).map(([, position]) => position),
    ).toEqual([1, 1, 2, 2, 2, 3]);
  });

  it('treats averages that are equal with 2 decimals as a tie', () => {
    expect(positions([row(1, 85.33), row(2, 85.334)])).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it('does not let floating point noise break a tie', () => {
    const gradeA = 0.057 * 90 + 0.057 * 90 + 0.057 * 25;
    const gradeB = 0.057 * 25 + 0.057 * 90 + 0.057 * 90;
    expect(gradeA).not.toBe(gradeB);

    expect(positions([row(1, gradeA), row(2, gradeB)])).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it('separates averages that differ at the second decimal', () => {
    expect(positions([row(1, 85.33), row(2, 85.34)])).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it('orders co-winners by project id for display, not by name', () => {
    expect(positions([row(9, 80), row(3, 80), row(5, 80)])).toEqual([
      [3, 1],
      [5, 1],
      [9, 1],
    ]);
  });

  it('rounds the grade to 2 decimals with the rule of evaluation-service', () => {
    expect(roundGrade(85.334)).toBe(85.33);
    expect(roundGrade(85.335)).toBe(85.34);
    expect(roundGrade(0.057 * 90 + 0.057 * 90 + 0.057 * 25)).toBe(11.69);
    expect(roundGrade(0.057 * 25 + 0.057 * 90 + 0.057 * 90)).toBe(11.69);
  });

  describe('public cut', () => {
    const ranked = () =>
      assignRankingPositions([
        row(1, 95),
        row(2, 90),
        row(3, 85),
        row(4, 85),
        row(5, 70),
      ]);

    it('includes every co-winner at the last visible position', () => {
      expect(
        filterVisiblePositions(ranked(), 3).map((r) => r.projectId),
      ).toEqual([1, 2, 3, 4]);
    });

    it('cuts by position, not by row count', () => {
      expect(
        filterVisiblePositions(ranked(), 2).map((r) => r.projectId),
      ).toEqual([1, 2]);
    });

    it('shows every row when the cut is not positive', () => {
      expect(filterVisiblePositions(ranked(), 0)).toHaveLength(5);
    });
  });
});
