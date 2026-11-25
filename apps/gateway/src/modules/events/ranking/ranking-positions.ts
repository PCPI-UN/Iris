import { roundGrade } from '@app/common/utils/grade-rounding';

/**
 * Ranking position rules (decision of the 27 Oct meeting: no tie-break,
 * tied projects are co-winners).
 *
 * - Averages are compared rounded to 2 decimals, the same precision shown
 *   in the ranking report, so floating point noise never breaks a tie.
 * - Positions are dense: projects with the same rounded average share the
 *   position and the next distinct average takes the next one (1, 1, 2).
 * - Inside a tie the order is only for display (project id) and does not
 *   affect the position.
 */

export interface RankableRow {
  projectId: number;
  averageGrade: number;
  position: number;
}

/**
 * Sorts rows by rounded average (descending) and assigns dense positions.
 * Returns a new array; the given rows are updated in place with their position.
 */
export function assignRankingPositions<T extends RankableRow>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => {
    const gradeDiff =
      roundGrade(b.averageGrade) - roundGrade(a.averageGrade);
    if (gradeDiff !== 0) {
      return gradeDiff;
    }
    return a.projectId - b.projectId;
  });

  let position = 0;
  let previousGrade: number | undefined;
  for (const row of sorted) {
    const grade = roundGrade(row.averageGrade);
    if (grade !== previousGrade) {
      position += 1;
      previousGrade = grade;
    }
    row.position = position;
  }

  return sorted;
}

/**
 * Keeps the rows whose position is within the public cut. Every project tied
 * at the last visible position is included, so the result can have more rows
 * than `positions`. A non-positive cut shows every row.
 */
export function filterVisiblePositions<T extends RankableRow>(
  rows: T[],
  positions: number,
): T[] {
  if (positions <= 0) {
    return rows;
  }
  return rows.filter((row) => row.position <= positions);
}

/**
 * Position of one project among the given averages, with the same rule as the ranking,
 * and whether another project shares it. null when the project is not among them (it
 * has no evaluations, or is not approved).
 */
export function positionOf(
  rows: { projectId: number; averageGrade: number }[],
  projectId: number,
): { position: number; tied: boolean } | null {
  const ranked = assignRankingPositions(
    rows.map((row) => ({ ...row, position: 0 })),
  );
  const own = ranked.find((row) => row.projectId === projectId);
  if (!own) return null;
  return {
    position: own.position,
    tied: ranked.some(
      (row) => row.position === own.position && row.projectId !== projectId,
    ),
  };
}
