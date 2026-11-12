import { BadRequestException, Injectable } from '@nestjs/common';
import { EventService } from '../events/events.service';
import { ProjectsService } from '../projects/projects.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { RankingReportFormat } from '../events/dto/ranking-report/get-ranking-report.dto';
import {
  StudentResultRanking,
  StudentResultsResponse,
} from './dto/student-results.response';

/**
 * Results of the caller's project in an event.
 *
 * - The project is the caller's one in the event (404 otherwise): the user comes from the
 *   session, so nobody reads another student's results.
 * - Until the admin publishes the event results only `{ resultsPublished: false }` is sent:
 *   no partial grade, no juror state.
 * - Once published: average grade, average per criterion and the jurors' comments in one
 *   text. Never juror ids, names or how many jurors evaluated.
 * - The ranking shows only the project's own position inside its category.
 */
@Injectable()
export class StudentResultsService {
  constructor(
    private readonly eventsService: EventService,
    private readonly projectsService: ProjectsService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  async getMyResults(
    userId: number,
    eventId: number,
  ): Promise<StudentResultsResponse> {
    const [{ project }, { event }] = await Promise.all([
      this.projectsService.getMyProjectByEvent(userId, eventId),
      this.eventsService.get({ id: eventId }),
    ]);

    if (!project || !event?.resultsPublished) {
      return { resultsPublished: false };
    }

    const result = await this.evaluationsService.getProjectResult(project.id);
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
      ranking: await this.ownRanking(eventId, project.id, project.courseId),
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

  // Same ranking as the admin report, narrowed to the project's category; only its row is kept
  private async ownRanking(
    eventId: number,
    projectId: number,
    categoryId: number,
  ): Promise<StudentResultRanking | null> {
    let items: { projectId: number; position: number; category: string }[];
    try {
      const report = await this.eventsService.generateRankingReport(
        eventId,
        { categoryId, format: RankingReportFormat.JSON },
        'admin',
      );
      items = report.items;
    } catch (error: unknown) {
      // An event without ranking configuration has no positions
      if (error instanceof BadRequestException) return null;
      throw error;
    }

    const own = items.find((item) => item.projectId === projectId);
    if (!own) return null;

    const winners = items.filter((item) => item.position === 1).length;
    const { awards = [] } = await this.eventsService.listAwardsByProjects([
      projectId,
    ]);
    const titles = awards
      .filter((a) => a.eventId === eventId && a.resultsPublished)
      .map((a) => a.title)
      .filter(Boolean);

    return {
      position: own.position,
      isWinner: own.position === 1,
      isCoWinner: own.position === 1 && winners > 1,
      categoryName: own.category,
      awardTitle: titles.length ? titles.join(', ') : null,
    };
  }
}
