import { EvaluationType } from '../../../../common/constants/evaluation-type.constants';
import { ScoreMapper } from '../../domain/ports/score-mapper.port';
export class ZeroToFiveScoreMapper implements ScoreMapper {
  // Values from the poster rubric: Excelente 5, Bueno 4, Aceptable 3, Insuficiente 2.
  private static readonly VALUE_TO_SCORE_MAP: Record<number, number> = {
    1: 2,
    2: 3,
    3: 4,
    4: 5,
  };
  // 1.5 was the stored value for level 1 before it was aligned with the rubric;
  // it is kept so historical evaluations can still be read back.
  private static readonly SCORE_TO_VALUE_MAP: Record<number, number> = {
    1.5: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
  };
  map(score: number, evaluationType: EvaluationType): number {
    if (evaluationType !== EvaluationType.ZERO_TO_FIVE) {
      throw new Error(
        `Invalid evaluation type for ZERO_TO_FIVE mapper: ${evaluationType}`,
      );
    }
    const mappedScore = ZeroToFiveScoreMapper.VALUE_TO_SCORE_MAP[score];
    if (mappedScore === undefined) {
      throw new Error(
        `Invalid score for ZERO_TO_FIVE. Score must be one of: 1, 2, 3, 4.`,
      );
    }
    return mappedScore;
  }

  toOriginalValue(score: number): number {
    const rounded = Math.round(score * 10) / 10;
    const value = ZeroToFiveScoreMapper.SCORE_TO_VALUE_MAP[rounded];
    if (value === undefined) {
      throw new Error(
        `Invalid stored score for ZERO_TO_FIVE. Must be 2, 3, 4, or 5.`,
      );
    }
    return value;
  }
}
