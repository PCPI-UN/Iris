import {
  ListPublishedWinnersResponse,
  PublishedEventWinnersProto,
} from '@app/common/generated/event';
import { WinnersPage, WinnersPageEvent } from '../types/winners-page.types';

export class PublishedWinnersMapper {
  static toEventProto(event: WinnersPageEvent): PublishedEventWinnersProto {
    return {
      eventId: event.eventId,
      name: event.name,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      categories: event.categories.map((category) => ({
        categoryId: category.categoryId,
        name: category.name,
        awards: category.awards.map((award) => ({
          awardId: award.awardId,
          title: award.title,
          position: award.position,
          coWinners: award.coWinners,
          winners: award.winners.map((winner) => ({
            winnerId: winner.winnerId,
            projectId: winner.projectId,
            // proto3 optional: unset means hidden
            grade: winner.grade ?? undefined,
          })),
        })),
      })),
    };
  }

  static toListResponse(page: WinnersPage): ListPublishedWinnersResponse {
    return {
      events: page.events.map((event) => this.toEventProto(event)),
      meta: {
        total: page.total,
        itemsOnCurrentPage: page.events.length,
        itemsPerPage: page.limit,
        currentPage: page.page,
        totalPages: Math.ceil(page.total / page.limit),
      },
    };
  }
}
