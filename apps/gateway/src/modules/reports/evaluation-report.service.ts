import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GetProjectResultResponse } from '@app/common/generated/evaluation';
import { EventService } from '../events/events.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { ProjectsService } from '../projects/projects.service';
import { assignRankingPositions } from '../events/ranking/ranking-positions';
import { canReadUnpublishedGrades } from '../academic/academic.service';
import { AppUser } from '../auth/types/app-user.type';
import {
  EvaluationReport,
  EvaluationReportComponent,
  EvaluationReportProject,
  EvaluationReportScope,
} from './evaluation-report.types';

/** Separator evaluation-service uses to join the jurors' comments in one text */
const FEEDBACK_SEPARATOR = '\n\n';

/** Permission of the academic roles whose projects project-service limits to their scope */
const ACADEMIC_READ_PERMISSION = 'read:academic_projects';

const NOT_PUBLISHED = 'The results of the event have not been published yet';

/** Rounds a weight to 4 decimals, enough to show 0.057 and still add up to 1 */
const roundWeight = (weight: number): number =>
  Math.round(weight * 10000) / 10000;

/**
 * Evaluation report of one category of an event (CU-86e3vmz0b) and who may download it
 * (CU-86e3vmz0c).
 *
 * - Every approved project of the category is listed; the ones without evaluations go
 *   last, without grade nor position.
 * - Grades, criterion averages and comments come from evaluation-service
 *   (GetProjectResult), the same source as the student results, so the report and IRIS
 *   always agree.
 * - Positions use the ranking rule (dense positions over the rounded averages): projects
 *   with the same average are co-winners and share the position (CU-86e3vmz0h). They are
 *   computed over the whole category even when only some rows are shown. The grades are
 *   never changed.
 *
 * Who sees which rows:
 * - `read:grades` (Admin, EventManager, FacultyAdmin, Dean): every project, at any time.
 * - `read:academic_projects` (Tutor, Professor, DepartmentDirector): only the projects
 *   project-service puts in their scope (tutored, of their course sections, of their
 *   department), and only once the admin publishes the event results.
 * - Student: only their own project, once published, without the number of jurors.
 */
@Injectable()
export class EvaluationReportService {
  constructor(
    private readonly eventsService: EventService,
    private readonly evaluationsService: EvaluationsService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Report of a category for a staff or academic user, with the rows of their scope */
  async buildForUser(
    user: AppUser,
    eventId: number,
    categoryId: number,
  ): Promise<EvaluationReport> {
    if (canReadUnpublishedGrades(user)) {
      return this.build(eventId, categoryId);
    }

    if (!(user.platformPermissions ?? []).includes(ACADEMIC_READ_PERMISSION)) {
      throw new ForbiddenException(
        'You are not allowed to download this report',
      );
    }

    const event = await this.eventsService.getEventById(eventId);
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    if (!event.resultsPublished) throw new ForbiddenException(NOT_PUBLISHED);

    const inScope = await this.projectsService.listAllProjectsInScope({
      userId: user.id,
      eventId,
    });
    const projectIds = inScope
      .filter((project) => project.courseId === categoryId)
      .map((project) => project.id);
    const noProjects = new NotFoundException(
      `You have no approved projects in category ${categoryId} of event ${eventId}`,
    );
    if (!projectIds.length) throw noProjects;

    const report = await this.build(eventId, categoryId, { projectIds });
    // Projects of the scope that were not approved are not graded nor listed
    if (!report.projects.length) throw noProjects;
    return report;
  }

  /** Report of the caller's own project in the event, once the results are published */
  async buildForStudent(
    userId: number,
    eventId: number,
  ): Promise<EvaluationReport> {
    const [{ project }, event] = await Promise.all([
      // NOT_FOUND (404) when the user has no project in the event
      this.projectsService.getMyProjectByEvent(userId, eventId),
      this.eventsService.getEventById(eventId),
    ]);
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    if (!event.resultsPublished) throw new ForbiddenException(NOT_PUBLISHED);

    const report = await this.build(eventId, project!.courseId, {
      projectIds: [project!.id],
      showJurorCount: false,
    });
    // Only approved projects are graded and ranked
    if (!report.projects.length) {
      throw new NotFoundException(
        `Project ${project!.id} is not part of the results of event ${eventId}`,
      );
    }
    return report;
  }

  async build(
    eventId: number,
    categoryId: number,
    scope: EvaluationReportScope = {},
  ): Promise<EvaluationReport> {
    const showJurorCount = scope.showJurorCount ?? true;
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
    const visible = scope.projectIds ? new Set(scope.projectIds) : undefined;
    const isVisible = (id: number) => !visible || visible.has(id);
    const visibleIds = projects.map((p) => p.id).filter(isVisible);

    // Averages of the whole category, so the positions are the real ones
    const [averages, results] = await Promise.all([
      this.evaluationsService.getAverageGrades(projects.map((p) => p.id)),
      Promise.all(
        visibleIds.map((id) => this.evaluationsService.getProjectResult(id)),
      ),
    ]);

    const resultById = new Map<number, GetProjectResultResponse>(
      visibleIds.map((id, index) => [id, results[index]]),
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
    const notEvaluated = visibleIds
      .filter((id) => !positionById.has(id))
      .sort((a, b) => a - b);
    const orderedIds = [
      ...ranked.map((row) => row.projectId).filter(isVisible),
      ...notEvaluated,
    ];

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
        jurorCount: showJurorCount ? (average?.evaluationCount ?? 0) : null,
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
      showJurorCount,
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
