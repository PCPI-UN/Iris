import { Injectable, Logger } from '@nestjs/common';
import {
  StudentCurrentProject,
  StudentParticipation,
} from '@app/common/generated/project';
import { ProjectsService } from '../projects/projects.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { AppUser } from '../auth/types/app-user.type';
import {
  StudentDashboardCurrentProject,
  StudentDashboardResponse,
  StudentDashboardTrajectoryItem,
} from './dto/student-dashboard.response';

/**
 * Student dashboard. The figures and the academic data are computed in project-service in
 * one call; the gateway joins them with the session user, adds the scores of the events
 * whose results the admin published, and names the fields as the frontend expects.
 *
 * - Scores (`evaluation.finalScore`, `trajectory[].finalScore`) are only sent for events
 *   with published results; until then they are null.
 * - Certificates (`trajectory[].certificates`): always empty, there is no certificate model.
 */
@Injectable()
export class StudentDashboardService {
  private readonly logger = new Logger(StudentDashboardService.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly evaluationsService: EvaluationsService,
  ) {}

  async getDashboard(user: AppUser): Promise<StudentDashboardResponse> {
    const stats = await this.projectsService.getStudentParticipationStats(
      user.id,
      user.email,
    );
    const academic = stats.academic;
    const participations = stats.participations ?? [];
    const current = stats.currentProject;

    const scores = await this.publishedScores([
      ...participations
        .filter((p) => p.resultsPublished)
        .map((p) => p.projectId),
      ...(current?.resultsPublished ? [current.projectId] : []),
    ]);

    return {
      profile: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        studentCode: academic?.studentCode || null,
        career: academic?.career || null,
        semester: toSemesterNumber(academic?.semester),
      },
      kpis: {
        totalFairs: stats.totalEvents ?? 0,
        totalProjects: stats.totalProjects ?? 0,
        totalAwards: stats.totalAwards ?? 0,
      },
      currentProject: current ? toCurrentProject(current) : null,
      evaluation: current
        ? {
            resultsPublished: current.resultsPublished === true,
            finalScore: scores.get(current.projectId) ?? null,
          }
        : null,
      trajectory: participations.map((p) =>
        toTrajectoryItem(p, scores.get(p.projectId) ?? null),
      ),
      bySemester: (stats.bySemester ?? []).map((s) => ({
        semester: s.semester,
        fairs: s.events,
        projects: s.projects,
        awards: s.awards,
      })),
    };
  }

  /**
   * Final score of each project, only for projects that were evaluated. If a score cannot
   * be read the dashboard is still answered, without that score.
   */
  private async publishedScores(
    projectIds: number[],
  ): Promise<Map<number, number>> {
    const ids = [...new Set(projectIds)];
    const entries = await Promise.all(
      ids.map(async (projectId): Promise<[number, number] | null> => {
        try {
          const result =
            await this.evaluationsService.getProjectResult(projectId);
          return result.evaluated ? [projectId, result.finalScore] : null;
        } catch (error: unknown) {
          this.logger.warn(
            `Score of project ${projectId} unavailable for the student dashboard: ${(error as Error)?.message}`,
          );
          return null;
        }
      }),
    );
    return new Map(entries.filter((e): e is [number, number] => e !== null));
  }
}

/** The semester captured at submission is free text ("8"); anything else is null */
function toSemesterNumber(value?: string | null): number | null {
  const trimmed = value?.trim() ?? '';
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function toCurrentProject(
  p: StudentCurrentProject,
): StudentDashboardCurrentProject {
  return {
    id: p.projectId,
    eventId: p.eventId,
    eventName: p.eventName,
    semester: p.semester,
    projectCode: p.projectCode || null,
    name: p.name,
    description: p.description || null,
    categoryName: p.courseName || null,
    enrollmentStatus: p.state,
    canEdit: p.canEdit,
    participantsCount: p.participantsCount,
    documentsCount: p.documentsCount,
  };
}

function toTrajectoryItem(
  p: StudentParticipation,
  finalScore: number | null,
): StudentDashboardTrajectoryItem {
  const awards = (p.awards ?? []).map((a) => a.title).filter(Boolean);
  return {
    id: p.projectId,
    eventId: p.eventId,
    semester: p.semester,
    eventName: p.eventName,
    courseName: p.courseName || null,
    projectName: p.projectName,
    finalScore,
    award: awards.length ? awards.join(', ') : null,
    isCurrent: !p.finished,
    certificates: [],
  };
}
