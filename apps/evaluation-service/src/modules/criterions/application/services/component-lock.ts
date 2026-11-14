import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';

/**
 * The components of an event are locked once it has evaluations, with no exception:
 * any change would grade the remaining jurors with a different rubric than the ones who
 * already evaluated (e.g. an event left at 0.979 by the rubric migration would let early
 * jurors grade out of 88.11 and later ones out of 90), and the ranking would compare both.
 * Historical grades are never recalculated, so the rubric they were graded with must stay.
 */
export async function areComponentsLocked(
  criterionRepository: CriterionRepositoryPort,
  eventId: number,
): Promise<boolean> {
  return criterionRepository.hasEvaluationsForEvent(eventId);
}

export function componentsLockedMessage(eventId: number): string {
  return `Event ${eventId} already has evaluations; its components cannot be modified`;
}
