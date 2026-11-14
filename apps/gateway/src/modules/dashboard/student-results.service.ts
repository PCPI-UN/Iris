import { Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { EventService } from '../events/events.service';
import { ProjectsService } from '../projects/projects.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { assignRankingPositions } from '../events/ranking/ranking-positions';
import {
  StudentResultRanking,
  StudentResultsResponse,
} from './dto/student-results.response';

/**
 * Results of the caller's project in an event.
 *
 * - The project is the caller's one in the event (project-service answers 404 otherwise):
 *   the user comes from the session, so nobody reads another student's results.
 * - Until the admin publishes the event results only `{ resultsPublished: false }` is sent:
 *   no partial grade, no juror state.
 * - Once published: average grade, average per criterion and the jurors' comments in one
 *   text. Never juror ids, names or how many jurors evaluated.
 * - The ranking shows only the project's own position inside its category. If it cannot
 *   be computed, the rest of the result is still sent with `ranking: null`.
 */
@Injectable()
export class StudentResultsService {
  private readonly logger = new Logger(StudentResultsService.name);

  constructor(
    private readonly eventsService: EventService,
    private readonly projectsService: ProjectsService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  async getMyResults(
    userId: number,
    eventId: number,
  ): Promise<StudentResultsResponse> {
    const [{ project }, event] = await Promise.all([
      this.projectsService.getMyProjectByEvent(userId, eventId),
      this.eventsService.getEventById(eventId),
    ]);

    if (!event?.resultsPublished) {
      return { resultsPublished: false };
    }

    // project-service answers NOT_FOUND when the caller has no project in the event
    const { id: projectId, courseId } = project!;
    const result = await this.evaluationsService.getProjectResult(projectId);
    if (!result.evaluated) {
      return {
        resultsPublished: true,
        evaluated: false,
        finalScore: null,
        maxScore: result.maxScore,
        ranking: null,
        criteriaScores: [],
        consolidatedFeedback: '',
      };
    }

    return {
      resultsPublished: true,
      evaluated: true,
      finalScore: result.finalScore,
      maxScore: result.maxScore,
      ranking: await this.ownRanking(eventId, projectId, courseId),
      criteriaScores: (result.criteria ?? []).map((c) => ({
        id: c.criterionId,
        criterion: c.criterion,
        component: c.component,
        weight: Math.round(c.weight * 10000) / 100,
        score: c.score,
        maxScore: result.maxScore,
      })),
      consolidatedFeedback: result.consolidatedFeedback ?? '',
    };
  }

  /**
   * Own position with the same rule as the ranking report (dense positions over the
   * rounded averages, ties are co-winners), computed from the averages of the approved
   * projects of the category in one call. Only for events with a ranking configuration.
   * Any failure leaves the ranking out instead of failing the whole result.
   */
  private async ownRanking(
    eventId: number,
    projectId: number,
    categoryId: number,
  ): Promise<StudentResultRanking | null> {
    try {
      const { rankingEvent } =
        await this.eventsService.getRankingEventByEventId(eventId);
      if (!rankingEvent) return null;

      const projects = await this.eventsService.listApprovedProjects(
        eventId,
        categoryId,
      );
      const grades = await this.evaluationsService.getAverageGrades(
        projects.map((p) => p.id),
      );
      const ranked = assignRankingPositions(
        grades.map((g) => ({ ...g, position: 0 })),
      );

      const own = ranked.find((row) => row.projectId === projectId);
      if (!own) return null;

      const [{ category }, { awards = [] }] = await Promise.all([
        this.eventsService.getCategory(categoryId),
        this.eventsService.listAwardsByProjects([projectId]),
      ]);
      const titles = awards
        .filter((a) => a.eventId === eventId && a.resultsPublished)
        .map((a) => a.title)
        .filter(Boolean);
      const winners = ranked.filter((row) => row.position === 1).length;

      return {
        position: own.position,
        isWinner: own.position === 1,
        isCoWinner: own.position === 1 && winners > 1,
        categoryName: category?.name?.trim() || 'Sin categoria',
        awardTitle: titles.length ? titles.join(', ') : null,
      };
    } catch (error: unknown) {
      // An event without ranking configuration has no positions
      if ((error as { code?: number } | null)?.code === status.NOT_FOUND) {
        return null;
      }
      this.logger.warn(
        `Ranking of project ${projectId} in event ${eventId} unavailable: ${(error as Error)?.message}`,
      );
      return null;
    }
  }
}
