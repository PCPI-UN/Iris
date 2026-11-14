import { ProjectAward } from '../entities/project-award.entity';
import {
  PublishedWinner,
  PublishedWinnersEventsPage,
} from '../entities/published-winner.entity';

export abstract class AwardWinnerRepository {
  /**
   * Awards won by the given projects in active categories, ordered by event, category
   * and award position.
   */
  abstract findByProjectIds(projectIds: number[]): Promise<ProjectAward[]>;

  /**
   * A page of the active events whose results are published (events.results_published),
   * whose ranking is public (ranking_event.visible_public) and that have at least one
   * winner in an active category, newest end date first
   * (ties by id, newest first).
   */
  abstract findEventsWithPublishedWinners(
    page: number,
    limit: number,
  ): Promise<PublishedWinnersEventsPage>;

  /**
   * Winners in active categories of the given events, ordered by category, award
   * position and winner id.
   */
  abstract findWinnersByEventIds(eventIds: number[]): Promise<PublishedWinner[]>;
}
