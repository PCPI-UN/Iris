import { Injectable, NotFoundException } from '@nestjs/common';
import { GetProjectResultResponse } from '@app/common/generated/evaluation';
import { EventService } from '../events/events.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { assignRankingPositions } from '../events/ranking/ranking-positions';
import {
  EvaluationReport,
  EvaluationReportComponent,
  EvaluationReportProject,
} from './evaluation-report.types';

/** Separator evaluation-service uses to join the jurors' comments in one text */
const FEEDBACK_SEPARATOR = '\n\n';

/** Rounds a weight to 4 decimals, enough to show 0.057 and still add up to 1 */
const roundWeight = (weight: number): number =>
  Math.round(weight * 10000) / 10000;

/**
 * Evaluation report of one category of an event (CU-86e3vmz0b).
 *
 * - Every approved project of the category is listed; the ones without evaluations go
 *   last, without grade nor position.
 * - Grades, criterion averages and comments come from evaluation-service
 *   (GetProjectResult), the same source as the student results, so the report and IRIS
 *   always agree.
 * - Positions use the ranking rule (dense positions over the rounded averages): projects
 *   with the same average are co-winners and share the position (CU-86e3vmz0h). The
 *   grades are never changed.
 * - It does not check who asks: the endpoint requires `read:grades`.
 */
@Injectable()
export class EvaluationReportService {
  constructor(
    private readonly eventsService: EventService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  async build(eventId: number, categoryId: number): Promise<EvaluationReport> {
    const [event, { category }] = await Promise.all([
      this.eventsService.getEventById(eventId),
      this.eventsService.getCategory(categoryId),
    ]);

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found`);
    }
    if (!category || category.eventId !== eventId) {
      throw new NotFoundException(
        `Category ${categoryId} not found in event ${eventId}`,
      );
    }

    const projects = await this.eventsService.listApprovedProjects(
      eventId,
      categoryId,
    );
    const projectIds = projects.map((p) => p.id);

    const [averages, results] = await Promise.all([
      this.evaluationsService.getAverageGrades(projectIds),
      Promise.all(
        projectIds.map((id) => this.evaluationsService.getProjectResult(id)),
      ),
    ]);

    const resultById = new Map<number, GetProjectResultResponse>(
      projectIds.map((id, index) => [id, results[index]]),
    );
    const averageById = new Map(averages.map((a) => [a.projectId, a]));

    // Same positions as the ranking: sorted by average, ties share the position
    const ranked = assignRankingPositions(
      averages.map((a) => ({ ...a, position: 0 })),
    );
    const positionById = new Map<number, number>(
      ranked.map((row) => [row.projectId, row.position]),
    );

    const projectById = new Map(projects.map((p) => [p.id, p]));
    const notEvaluated = projectIds
      .filter((id) => !positionById.has(id))
      .sort((a, b) => a - b);
    const orderedIds = [...ranked.map((row) => row.projectId), ...notEvaluated];

    const rows: EvaluationReportProject[] = orderedIds.map((id, index) => {
      const project = projectById.get(id)!;
      const result = resultById.get(id)!;
      const average = averageById.get(id);
      const evaluated = average !== undefined;

      return {
        rowNumber: index + 1,
        projectId: id,
        projectCode: project.projectCode || undefined,
        projectName: project.name,
        participantNames:
          this.eventsService.getProjectParticipantNames(project),
        evaluated,
        // The ranking average, so the grade shown is the one the position comes from
        finalScore: average?.averageGrade ?? null,
        position: positionById.get(id) ?? null,
        jurorCount: average?.evaluationCount ?? 0,
        comments: splitFeedback(result.consolidatedFeedback),
        components: evaluated ? groupByComponent(result) : [],
      };
    });

    return {
      eventId,
      eventName: event.name?.trim() || `Evento ${eventId}`,
      categoryId,
      categoryName: category.name?.trim() || 'Sin categoria',
      maxScore: results.find((r) => r.maxScore > 0)?.maxScore ?? 0,
      generatedAt: new Date(),
      projects: rows,
    };
  }
}

/** The jurors' comments one by one, from the text evaluation-service joins */
export function splitFeedback(feedback: string | undefined): string[] {
  return (feedback ?? '')
    .split(FEEDBACK_SEPARATOR)
    .map((comment) => comment.trim())
    .filter((comment) => comment.length > 0);
}

/**
 * Criteria grouped by component, in the order evaluation-service sends them (by
 * component, then criterion). The weight of a component is the sum of the effective
 * weights of its criteria, which is the share of the grade it had.
 */
export function groupByComponent(
  result: GetProjectResultResponse,
): EvaluationReportComponent[] {
  const components: EvaluationReportComponent[] = [];
  for (const criterion of result.criteria ?? []) {
    const name = criterion.component?.trim() || 'Sin componente';
    let component = components.find((c) => c.component === name);
    if (!component) {
      component = { component: name, weight: 0, criteria: [] };
      components.push(component);
    }
    component.weight += criterion.weight;
    component.criteria.push({
      criterionId: criterion.criterionId,
      criterion: criterion.criterion,
      weight: roundWeight(criterion.weight),
      score: criterion.score,
    });
  }
  return components.map((c) => ({ ...c, weight: roundWeight(c.weight) }));
}
