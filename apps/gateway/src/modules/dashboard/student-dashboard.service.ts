import { Injectable } from '@nestjs/common';
import {
  StudentCurrentProject,
  StudentParticipation,
} from '@app/common/generated/project';
import { ProjectsService } from '../projects/projects.service';
import { AppUser } from '../auth/types/app-user.type';
import {
  StudentDashboardCurrentProject,
  StudentDashboardResponse,
  StudentDashboardTrajectoryItem,
} from './dto/student-dashboard.response';

/**
 * Student dashboard. The figures and the academic data are computed in project-service in
 * one call; the gateway only joins them with the session user and names the fields as the
 * frontend expects.
 *
 * Not exposed yet:
 * - Scores (`evaluation`, `trajectory[].finalScore`): `resultsPublished` is always false
 *   and no score is sent.
 * - Certificates (`trajectory[].certificates`): always empty, there is no certificate model.
 */
@Injectable()
export class StudentDashboardService {
  constructor(private readonly projectsService: ProjectsService) {}

  async getDashboard(user: AppUser): Promise<StudentDashboardResponse> {
    const stats = await this.projectsService.getStudentParticipationStats(
      user.id,
      user.email,
    );
    const academic = stats.academic;

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
      currentProject: stats.currentProject
        ? toCurrentProject(stats.currentProject)
        : null,
      evaluation: stats.currentProject
        ? { resultsPublished: false, finalScore: null }
        : null,
      trajectory: (stats.participations ?? []).map(toTrajectoryItem),
      bySemester: (stats.bySemester ?? []).map((s) => ({
        semester: s.semester,
        fairs: s.events,
        projects: s.projects,
        awards: s.awards,
      })),
    };
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
): StudentDashboardTrajectoryItem {
  const awards = (p.awards ?? []).map((a) => a.title).filter(Boolean);
  return {
    id: p.projectId,
    eventId: p.eventId,
    semester: p.semester,
    eventName: p.eventName,
    courseName: p.courseName || null,
    projectName: p.projectName,
    finalScore: null,
    award: awards.length ? awards.join(', ') : null,
    isCurrent: !p.finished,
    certificates: [],
  };
}
