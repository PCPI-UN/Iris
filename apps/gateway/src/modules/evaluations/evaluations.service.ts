import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  EVALUATION_SERVICE_NAME,
  CRITERIONS_SERVICE_NAME,
  EvaluationServiceClient,
  CriterionsServiceClient,
  FindEvaluationsByEvaluatorResponse,
  FindCriterionsByCourseResponse,
  GetProjectStatsRequest,
  GetProjectStatsResponse,
  EvaluateProjectRequest,
  EvaluationProto,
  GetTopProjectsByCourseResponse,
} from '@app/common/generated/evaluation';
import {
  PROJECTS_SERVICE_NAME,
  ProjectsServiceClient,
  ListAssignedProjectsResponse,
  Project,
  ProjectState,
} from '@app/common/generated/project';
import {
  assignRankingPositions,
  filterVisiblePositions,
  roundRankingGrade,
} from '../events/ranking/ranking-positions';

@Injectable()
export class EvaluationsService implements OnModuleInit {
  private evaluationService: EvaluationServiceClient;
  private criterionsService: CriterionsServiceClient;
  private projectsService: ProjectsServiceClient;

  constructor(
    @Inject(EVALUATION_SERVICE_NAME) private evaluationClient: ClientGrpc,
    @Inject(CRITERIONS_SERVICE_NAME) private criterionsClient: ClientGrpc,
    @Inject(PROJECTS_SERVICE_NAME) private projectsClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.evaluationService =
      this.evaluationClient.getService<EvaluationServiceClient>(
        EVALUATION_SERVICE_NAME,
      );
    this.criterionsService =
      this.criterionsClient.getService<CriterionsServiceClient>(
        CRITERIONS_SERVICE_NAME,
      );
    this.projectsService =
      this.projectsClient.getService<ProjectsServiceClient>(
        PROJECTS_SERVICE_NAME,
      );
  }

  async getAssignedProjects(
    userId: number,
    eventId: number,
    roleId: number,
    page: number,
    limit: number,
  ) {
    // 1. Get assigned projects from Project Service
    const projectsResponse: ListAssignedProjectsResponse = await lastValueFrom(
      this.projectsService.listAssignedProjects({
        juror: {
          memberUserId: userId,
          memberEventId: eventId,
          memberRoleId: roleId,
        },
        page,
        pageSize: limit,
      }),
    );

    const projects = projectsResponse.items;

    // 2. Get evaluations for this juror from Evaluation Service
    // We can fetch all evaluations for this juror and event, then map them.
    // Assuming pagination matches or we fetch enough.
    // Ideally, we should have a `getEvaluationsByProjectIds` or similar, but `findEvaluationsByEvaluator` is available.
    // Let's fetch evaluations for the user/event.
    // Note: If the user has evaluated many projects, this might be inefficient if we only fetch a page of projects.
    // But for now, let's assume we can fetch evaluations and match.

    // Better approach: For each project, check if it's evaluated.
    // Or fetch all evaluations for the user in this event (assuming not thousands).

    const evaluationsResponse: FindEvaluationsByEvaluatorResponse =
      await lastValueFrom(
        this.evaluationService.findEvaluationsByEvaluator({
          userId,
          eventId,
          page: 1,
          limit: 1000, // Fetch many to ensure we cover the projects on the current page
        }),
      );

    const evaluationsMap = new Map();
    evaluationsResponse.evaluations.forEach((evaluation) => {
      evaluationsMap.set(evaluation.projectId, evaluation);
    });

    // 3. Merge data
    const result = projects.map((project) => {
      const evaluation = evaluationsMap.get(project.id);
      return {
        ...project,
        evaluationStatus: evaluation ? 'EVALUATED' : 'PENDING',
        evaluation: evaluation
          ? {
              id: evaluation.id,
              grade: evaluation.grade,
              comments: evaluation.comments,
            }
          : null,
      };
    });

    return {
      items: result,
      meta: {
        total: projectsResponse.total,
        page: projectsResponse.page,
        limit: projectsResponse.pageSize,
        totalPages: Math.ceil(
          projectsResponse.total / projectsResponse.pageSize,
        ),
      },
    };
  }

  async getCriterionsGrouped(
    courseId: number,
  ): Promise<FindCriterionsByCourseResponse> {
    return await lastValueFrom(
      this.criterionsService.findCriterionsByCourse({ courseId }),
    );
  }

  async getProjectStats(projectId: number): Promise<GetProjectStatsResponse> {
    const request: GetProjectStatsRequest = { projectId };
    return await lastValueFrom(this.evaluationService.getProjectStats(request));
  }

  async getDashboardStats() {
    return lastValueFrom(this.evaluationService.getDashboardStats({}));
  }

  async evaluateProject(
    projectId: number,
    userId: number,
    scores: Array<{ criterionId: number; score: number }>,
    comments?: string,
  ): Promise<EvaluationProto> {
    const request: EvaluateProjectRequest = {
      projectId,
      userId,
      scores,
      comments,
    };
    return await lastValueFrom(this.evaluationService.evaluateProject(request));
  }

  /**
   * Top projects of a course, with the same rules as the event ranking
   * (EventService.generateRankingReport): only approved projects with
   * evaluations compete, averages are compared rounded to 2 decimals, tied
   * projects are co-winners sharing the position (no tie-break), and the cut
   * keeps every project tied at the last visible position.
   */
  async getTopProjectsByCourse(
    courseId: number,
    eventId: number,
    limit: number = 5,
  ) {
    // 1. Fetch the approved projects of the course and event from project service
    const projectsResponse = await lastValueFrom(
      this.projectsService.listProjectsByEvent({
        eventId,
        courseId,
        state: ProjectState.APPROVED,
        currentPage: 1,
        itemsPerPage: 1000, // Fetch all projects for the course
      }),
    );

    const allProjects = projectsResponse.items ?? [];

    if (allProjects.length === 0) {
      return { items: [], courseId, eventId };
    }

    // 2. Get evaluation statistics for these projects from evaluation service
    const response: GetTopProjectsByCourseResponse = await lastValueFrom(
      this.evaluationService.getTopProjectsByCourse({
        projectIds: allProjects.map((p) => p.id),
      }),
    );

    const rankable = (response.topProjects ?? [])
      .filter((stats) => stats.evaluationCount > 0)
      .map((stats) => ({
        projectId: stats.projectId,
        averageGrade: roundRankingGrade(stats.averageGrade),
        evaluationCount: stats.evaluationCount,
        position: 0,
      }));

    if (rankable.length === 0) {
      return { items: [], courseId, eventId };
    }

    // 3. Dense positions for co-winners, then the top-N cut (0 shows every project)
    const topProjects = filterVisiblePositions(
      assignRankingPositions(rankable),
      limit,
    );

    // 4. Fetch full project details for the top projects in parallel
    const projectsResponses = await Promise.all(
      topProjects.map((tp) =>
        lastValueFrom(
          this.projectsService.getProjectComplete({ id: tp.projectId }),
        ).catch(() => null),
      ),
    );

    // 5. Merge data
    const items = topProjects
      .map((tp, idx) => {
        const projectResponse: any = projectsResponses[idx];
        if (!projectResponse?.items?.length) return null;
        const project = projectResponse.items[0];
        return {
          id: project.id,
          eventId: project.eventId,
          name: project.name,
          description: project.description,
          eventNumber: project.eventNumber,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          courseId: project.courseId,
          state: project.state,
          reason: project.reason,
          participants: project.participants,
          documents: project.documents,
          pendingParticipants: project.pendingParticipants,
          position: tp.position,
          averageGrade: tp.averageGrade,
          evaluationCount: tp.evaluationCount,
        };
      })
      .filter((p) => p !== null);

    return { items, courseId, eventId };
  }
}
