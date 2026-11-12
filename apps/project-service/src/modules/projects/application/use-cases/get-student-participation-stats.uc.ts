import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import {
  StudentCurrentProject,
  StudentParticipationStats,
  buildStudentParticipationStats,
  pickCurrentProject,
} from '../../domain/student-participation-stats';
import {
  AcademicProfile,
  deriveAcademicProfile,
} from '../../domain/academic-profile';
import { Project } from '../../domain/entities/project.entity';
import { ValidationError } from '../../domain/errors';
import { GetStudentParticipationStatsDTO } from '../dto/get-student-participation-stats.dto';

export interface StudentCurrentProjectWithCounts extends StudentCurrentProject {
  participantsCount: number;
  documentsCount: number;
}

export interface StudentDashboardData extends StudentParticipationStats {
  currentProject: StudentCurrentProjectWithCounts | null;
  academic: AcademicProfile;
}

/**
 * Data of the student dashboard: participation statistics, history by semester, the
 * project of the event that has not ended and the academic data of the user.
 *
 * - Statistics and history only count APPROVED projects of events that were not deleted,
 *   and awards only once the event ranking is published (see buildStudentParticipationStats).
 * - The current project is taken from every project of the user, whatever its review
 *   state, following the priority of pickCurrentProject.
 * - The academic data is derived from all the user's participations, as in
 *   ListUserParticipations, so the dashboard needs a single call.
 * - The user id must be the authenticated one: the gateway takes it from the session.
 */
@Injectable()
export class GetStudentParticipationStatsUC {
  private readonly logger = new Logger(GetStudentParticipationStatsUC.name);

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
  ) {}

  async execute(
    input: GetStudentParticipationStatsDTO,
  ): Promise<StudentDashboardData> {
    if (!Number.isInteger(input.userId) || input.userId < 1) {
      throw new ValidationError('userId must be a positive integer');
    }

    const [projects, participations] = await Promise.all([
      this.repo.listProjectsByParticipant(input.userId, []),
      input.email?.trim()
        ? this.repo.listParticipationsByUser(input.userId, input.email)
        : Promise.resolve([]),
    ]);
    const academic = deriveAcademicProfile(participations);

    if (!projects.length) {
      return {
        ...buildStudentParticipationStats([], [], []),
        currentProject: null,
        academic,
      };
    }

    const approved = projects.filter((project) => project.state === 'APPROVED');
    const eventIds = [...new Set(projects.map((project) => project.eventId))];
    const [events, awards, courseNames] = await Promise.all([
      this.events.listEventsByIds(eventIds),
      this.events.listAwardsByProjects(approved.map((project) => project.id)),
      this.courseNames(projects),
    ]);

    const current = pickCurrentProject(projects, events, courseNames);

    return {
      ...buildStudentParticipationStats(approved, events, awards, courseNames),
      currentProject: current ? await this.withCounts(current) : null,
      academic,
    };
  }

  private async withCounts(
    current: StudentCurrentProject,
  ): Promise<StudentCurrentProjectWithCounts> {
    const [team, documents] = await Promise.all([
      // The team captured at submission, the same list GET /events/:id/my-project shows
      this.repo.listPendingParticipants(current.projectId),
      this.repo.listDocuments(current.projectId),
    ]);
    return {
      ...current,
      participantsCount: team.length,
      documentsCount: documents.filter((doc) => doc.state === 'ACTIVE').length,
    };
  }

  // Category (course) names by id in one call; if they cannot be read, names stay empty
  private async courseNames(projects: Project[]): Promise<Map<number, string>> {
    const ids = [...new Set(projects.map((project) => project.courseId))];
    try {
      const categories = await this.events.listCategoriesByIds(ids);
      return new Map(categories.map((c) => [c.id, c.name]));
    } catch (error: unknown) {
      this.logger.warn(
        `Category names unavailable for the student dashboard: ${(error as Error)?.message}`,
      );
      return new Map();
    }
  }
}
