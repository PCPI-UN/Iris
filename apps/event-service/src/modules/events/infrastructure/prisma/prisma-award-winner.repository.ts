import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/prisma/prisma.service';
import { AwardWinnerRepository } from '../../domain/repositories/award-winner.repository';
import { ProjectAward } from '../../domain/entities/project-award.entity';
import {
  PublishedWinner,
  PublishedWinnersEvent,
  PublishedWinnersEventsPage,
} from '../../domain/entities/published-winner.entity';

// An event enters the public winners view only when the admin published its results
// (the same flag the student dashboard uses for awards), its ranking is public and it has
// at least one winner in an active category.
const PUBLISHED_WINNERS_EVENT_WHERE = {
  active: true,
  resultsPublished: true,
  rankingEvent: { visiblePublic: true },
  categories: {
    some: {
      active: true,
      categoryAwards: { some: { awardWinnerEvents: { some: {} } } },
    },
  },
};

@Injectable()
export class PrismaAwardWinnerRepository extends AwardWinnerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByProjectIds(projectIds: number[]): Promise<ProjectAward[]> {
    if (!projectIds.length) return [];

    const rows = await this.prisma.awardWinnerEvent.findMany({
      // Awards of a deactivated category no longer count
      where: {
        projectId: { in: projectIds },
        award: { category: { active: true } },
      },
      include: {
        award: {
          include: {
            category: {
              include: { event: true },
            },
          },
        },
      },
      orderBy: [
        { award: { category: { eventId: 'asc' } } },
        { award: { categoryId: 'asc' } },
        { award: { position: 'asc' } },
        { id: 'asc' },
      ],
    });

    return rows.map(
      (row) =>
        new ProjectAward(
          row.id,
          row.projectId,
          row.awardId,
          row.award.title,
          row.award.position,
          row.award.categoryId,
          row.award.category.name,
          row.award.category.eventId,
          row.award.category.event.resultsPublished,
        ),
    );
  }

  async findEventsWithPublishedWinners(
    page: number,
    limit: number,
  ): Promise<PublishedWinnersEventsPage> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where: PUBLISHED_WINNERS_EVENT_WHERE,
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          rankingEvent: { select: { gradeVisible: true } },
        },
        orderBy: [{ endDate: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.event.count({ where: PUBLISHED_WINNERS_EVENT_WHERE }),
    ]);

    return {
      total,
      events: rows.map(
        (row) =>
          new PublishedWinnersEvent(
            row.id,
            row.name,
            row.startDate,
            row.endDate,
            row.rankingEvent?.gradeVisible === true,
          ),
      ),
    };
  }

  async findWinnersByEventIds(eventIds: number[]): Promise<PublishedWinner[]> {
    if (!eventIds.length) return [];

    const rows = await this.prisma.awardWinnerEvent.findMany({
      where: {
        award: { category: { active: true, eventId: { in: eventIds } } },
      },
      select: {
        id: true,
        projectId: true,
        grade: true,
        awardId: true,
        award: {
          select: {
            title: true,
            position: true,
            categoryId: true,
            category: { select: { name: true, eventId: true } },
          },
        },
      },
      orderBy: [
        { award: { categoryId: 'asc' } },
        { award: { position: 'asc' } },
        { awardId: 'asc' },
        { id: 'asc' },
      ],
    });

    return rows.map(
      (row) =>
        new PublishedWinner(
          row.id,
          row.projectId,
          row.grade,
          row.awardId,
          row.award.title,
          row.award.position,
          row.award.categoryId,
          row.award.category.name,
          row.award.category.eventId,
        ),
    );
  }
}
