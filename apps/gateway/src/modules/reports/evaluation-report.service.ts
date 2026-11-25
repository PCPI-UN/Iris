import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { GetProjectResultResponse } from '@app/common/generated/evaluation';
import {
  groupByComponent,
  splitFeedback,
} from '@app/common/utils/project-result.util';
import { EventService } from '../events/events.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { ProjectsService } from '../projects/projects.service';
import { assignRankingPositions } from '../events/ranking/ranking-positions';
import { canReadUnpublishedGrades } from '../academic/academic.service';
import { AcademicProfile, profileScope } from '../academic/academic-profiles';
import { AppUser } from '../auth/types/app-user.type';
import {
  EvaluationReport,
  EvaluationReportProject,
  EvaluationReportScope,
} from './evaluation-report.types';

/** Permission of the academic roles whose projects project-service limits to their scope */
const ACADEMIC_READ_PERMISSION = 'read:academic_projects';

const NOT_PUBLISHED = 'The results of the event have not been published yet';

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
 *   never changed. The reports filtered to a scope or to the student's project carry no
 *   position when the event has no ranking configuration, as the student results.
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

  /**
   * Report of a category for a staff or academic user, with the rows of their scope. With a
   * profile, only the scope of that profile (403 without its role), so the file matches the
   * academic screen it is asked from; without one, the union of the user's scopes.
   */
  async buildForUser(
    user: AppUser,
    eventId: number,
    categoryId: number,
    profile?: AcademicProfile,
  ): Promise<EvaluationReport> {
    const scope = profile ? profileScope(user, profile) : undefined;
    const seesUnpublished = canReadUnpublishedGrades(user);
    if (seesUnpublished && scope === undefined) {
      return this.build(eventId, categoryId);
    }

    if (
      !seesUnpublished &&
      !(user.platformPermissions ?? []).includes(ACADEMIC_READ_PERMISSION)
    ) {
      throw new ForbiddenException(
        'You are not allowed to download this report',
      );
    }

    const event = await this.eventsService.getEventById(eventId);
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    if (!event.resultsPublished && !seesUnpublished) {
      throw new ForbiddenException(NOT_PUBLISHED);
    }

    const [inScope, showPositions] = await Promise.all([
      this.projectsService.listAllProjectsInScope({
        userId: user.id,
        eventId,
        scope,
      }),
      this.hasRanking(eventId),
    ]);
    const projectIds = inScope
      .filter((project) => project.courseId === categoryId)
      .map((project) => project.id);
    const noProjects = new NotFoundException(
      `You have no approved projects in category ${categoryId} of event ${eventId}`,
    );
    if (!projectIds.length) throw noProjects;

    const report = await this.build(eventId, categoryId, {
      projectIds,
      showPositions,
    });
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
      showPositions: await this.hasRanking(eventId),
    });
    // Only approved projects are graded and ranked
    if (!report.projects.length) {
      throw new NotFoundException(
        `Project ${project!.id} is not part of the results of event ${eventId}`,
      );
    }
    return report;
  }

  /**
   * Whether the event has a ranking configuration, the same rule as the student results
   * (StudentResultsService.ownRanking): without one, the reports filtered to a scope or to
   * the student's project carry no position. event-service answers NOT_FOUND when the
   * event has none; any other error fails the report instead of hiding the positions.
   */
  private async hasRanking(eventId: number): Promise<boolean> {
    try {
      const { rankingEvent } =
        await this.eventsService.getRankingEventByEventId(eventId);
      return !!rankingEvent;
    } catch (error: unknown) {
      if ((error as { code?: number } | null)?.code === status.NOT_FOUND) {
        return false;
      }
      throw error;
    }
  }

  async build(
    eventId: number,
    categoryId: number,
    scope: EvaluationReportScope = {},
  ): Promise<EvaluationReport> {
    const showJurorCount = scope.showJurorCount ?? true;
    const showPositions = scope.showPositions ?? true;
    const [event, { category }] = await Promise.all([
      this.eventsService.getEventById(eventId),
      this.eventsService.getCategory(categoryId),
    ]);

    if (!event) {
      throw new NotFoundException(`No se encontró el evento con ID ${eventId}`);
    }
    if (!category || category.eventId !== eventId) {
      throw new NotFoundException(
        `No se encontró la categoría con ID ${categoryId} en el evento ${eventId}`,
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
        position: showPositions ? (positionById.get(id) ?? null) : null,
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
      showPositions,
      projects: rows,
    };
  }
}
