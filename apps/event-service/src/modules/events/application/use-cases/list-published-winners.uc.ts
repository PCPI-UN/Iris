import { Injectable } from '@nestjs/common';
import { AwardWinnerRepository } from '../../domain/repositories/award-winner.repository';
import {
  AwardWinners,
  CategoryWinners,
  EventWinners,
  PublishedWinner,
} from '../../domain/entities/published-winner.entity';
import { ListPublishedWinnersDTO } from '../dto/list-published-winners.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export interface PublishedWinnersPage {
  events: EventWinners[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Permanent winners view across events (CU-86e3wzr5x): winners and co-winners of every
 * active event whose ranking is public, grouped by event → category → award, newest
 * event first. Grades stay hidden unless the event ranking shows them, the same rule as
 * the public ranking report.
 */
@Injectable()
export class ListPublishedWinnersUC {
  constructor(private readonly repo: AwardWinnerRepository) {}

  async execute(input: ListPublishedWinnersDTO): Promise<PublishedWinnersPage> {
    const page = input.page || DEFAULT_PAGE;
    const limit = input.limit || DEFAULT_LIMIT;

    const { events, total } = await this.repo.findEventsWithPublishedWinners(
      page,
      limit,
    );
    if (!events.length) return { events: [], total, page, limit };

    const winners = await this.repo.findWinnersByEventIds(
      events.map((event) => event.id),
    );
    const winnersByEvent = new Map<number, PublishedWinner[]>();
    for (const winner of winners) {
      const list = winnersByEvent.get(winner.eventId) ?? [];
      list.push(winner);
      winnersByEvent.set(winner.eventId, list);
    }

    return {
      total,
      page,
      limit,
      events: events.map((event) => ({
        eventId: event.id,
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        categories: this.groupByCategory(
          winnersByEvent.get(event.id) ?? [],
          event.gradeVisible,
        ),
      })),
    };
  }

  /** Keeps the repository order (category, award position, winner id). */
  private groupByCategory(
    winners: PublishedWinner[],
    gradeVisible: boolean,
  ): CategoryWinners[] {
    const categories = new Map<number, CategoryWinners>();
    const awards = new Map<number, AwardWinners>();

    for (const winner of winners) {
      let category = categories.get(winner.categoryId);
      if (!category) {
        category = {
          categoryId: winner.categoryId,
          name: winner.categoryName,
          awards: [],
        };
        categories.set(winner.categoryId, category);
      }

      let award = awards.get(winner.awardId);
      if (!award) {
        award = {
          awardId: winner.awardId,
          title: winner.awardTitle,
          position: winner.awardPosition,
          coWinners: false,
          winners: [],
        };
        awards.set(winner.awardId, award);
        category.awards.push(award);
      }

      award.winners.push({
        winnerId: winner.winnerId,
        projectId: winner.projectId,
        grade: gradeVisible ? winner.grade : null,
      });
      award.coWinners = award.winners.length > 1;
    }

    return [...categories.values()];
  }
}
