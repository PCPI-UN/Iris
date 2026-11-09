import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { isFullWeight } from '../../../../common/utils/grade.utils';

/**
 * The components of an event are locked once it has evaluations, except while their
 * weights do not add up to 100%. Evaluating requires a complete rubric, so no grade was
 * computed with incomplete components and fixing them cannot change any grade (each
 * evaluation keeps the effective weights it was graded with).
 *
 * This is the way out for an event that was being evaluated when the rubric migration
 * ran: its components are left at the sum of its criteria (e.g. 0.979) and must be
 * adjusted before the remaining jurors can evaluate.
 */
export async function areComponentsLocked(
  criterionRepository: CriterionRepositoryPort,
  eventId: number,
): Promise<boolean> {
  if (!(await criterionRepository.hasEvaluationsForEvent(eventId))) {
    return false;
  }

  return isFullWeight(await criterionRepository.sumComponentWeightsByEvent(eventId));
}

export function componentsLockedMessage(eventId: number): string {
  return `Event ${eventId} already has evaluations and its components add up to 100%; its components cannot be modified`;
}
