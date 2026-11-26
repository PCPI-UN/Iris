import { roundGrade } from '../../../../common/utils/grade.utils';

/** One score of an evaluation, with the criterion and the effective weight it had. */
export interface ResultDetail {
  criterionId: number;
  criterionName: string;
  componentName: string | null;
  score: number;
  /** Effective weight stored when the project was evaluated (fraction of the grade) */
  weight: number;
}

/** One juror's evaluation of the project. The juror is not part of the result. */
export interface ResultEvaluation {
  grade: number;
  comments: string | null;
  details: ResultDetail[];
}

export interface CriterionResult {
  criterionId: number;
  criterion: string;
  component: string;
  weight: number;
  /** Average of the jurors' stored scores for this criterion */
  score: number;
}

export interface ProjectResult {
  /** false when no juror has evaluated the project yet */
  evaluated: boolean;
  /** Average of the jurors' grades, rounded as the ranking does */
  finalScore: number;
  criteria: CriterionResult[];
  /** The jurors' comments in one text, without saying who wrote each one */
  consolidatedFeedback: string;
}

const FEEDBACK_SEPARATOR = '\n\n';

/**
 * Consolidated result of a project for its participants: the average grade, the average
 * score per criterion and the comments of every juror in one anonymous text. It never
 * includes juror ids or how many jurors evaluated.
 */
export function buildProjectResult(
  evaluations: ResultEvaluation[],
): ProjectResult {
  if (!evaluations.length) {
    return {
      evaluated: false,
      finalScore: 0,
      criteria: [],
      consolidatedFeedback: '',
    };
  }

  const finalScore = roundGrade(
    evaluations.reduce((sum, e) => sum + e.grade, 0) / evaluations.length,
  );

  const byCriterion = new Map<
    number,
    { detail: ResultDetail; total: number; count: number }
  >();
  for (const evaluation of evaluations) {
    for (const detail of evaluation.details) {
      const entry = byCriterion.get(detail.criterionId) ?? {
        detail,
        total: 0,
        count: 0,
      };
      entry.total += detail.score;
      entry.count += 1;
      byCriterion.set(detail.criterionId, entry);
    }
  }

  const criteria = [...byCriterion.values()]
    .map(({ detail, total, count }) => ({
      criterionId: detail.criterionId,
      criterion: detail.criterionName,
      component: detail.componentName ?? '',
      weight: detail.weight,
      score: roundGrade(total / count),
    }))
    .sort(
      (a, b) =>
        a.component.localeCompare(b.component) || a.criterionId - b.criterionId,
    );

  const consolidatedFeedback = evaluations
    .map((e) => e.comments?.trim() ?? '')
    .filter((comment) => comment.length > 0)
    .join(FEEDBACK_SEPARATOR);

  return { evaluated: true, finalScore, criteria, consolidatedFeedback };
}
