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
import { Project } from '../../domain/entities/project.entity';
import { ValidationError } from '../../domain/errors';
import { GetStudentParticipationStatsDTO } from '../dto/get-student-participation-stats.dto';

export interface StudentCurrentProjectWithCounts extends StudentCurrentProject {
  participantsCount: number;
  documentsCount: number;
}

export interface StudentDashboardData extends StudentParticipationStats {
  currentProject: StudentCurrentProjectWithCounts | null;
}

/**
 * Data of the student dashboard (IRIS-V3-STD-01, ClickUp 86e3vmxb0): participation
 * statistics, history by semester and the project of the event in progress.
 *
 * - Statistics and history only count APPROVED projects of events that were not deleted
 *   (see buildStudentParticipationStats).
 * - The current project is taken from every project of the user, whatever its review
 *   state, so the student sees whether it is pending, approved or needs changes.
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

    const projects = await this.repo.listProjectsByParticipant(
      input.userId,
      [],
    );
    if (!projects.length) {
      return {
        ...buildStudentParticipationStats([], [], []),
        currentProject: null,
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

  // Category (course) names by id; a missing category only leaves its name empty
  private async courseNames(projects: Project[]): Promise<Map<number, string>> {
    const ids = [...new Set(projects.map((project) => project.courseId))];
    const entries = await Promise.all(
      ids.map(async (id): Promise<[number, string] | null> => {
        try {
          const course = (await this.events.getCourseById(id)) as {
            code?: string;
          } | null;
          return course?.code ? [id, course.code] : null;
        } catch (error: unknown) {
          this.logger.warn(
            `Category ${id} not found for the student dashboard: ${(error as Error)?.message}`,
          );
          return null;
        }
      }),
    );
    return new Map(entries.filter((e): e is [number, string] => e !== null));
  }
}
