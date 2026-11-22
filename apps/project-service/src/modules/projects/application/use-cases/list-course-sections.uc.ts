import { Inject, Injectable, Logger } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { NO_TERM_ID } from '../../domain/entities/project.entity';
import { NotFoundError } from '../../domain/errors';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';
import { EVENT_SERVICE_PORT, EventServicePort } from '../ports/event-service.port';

/** How long the list waits for auth-service before giving the sections without professor names */
export const PROFESSORS_LOOKUP_TIMEOUT_MS = 3000;

export interface CourseSectionProfessor {
  userId: number;
  firstName: string;
  lastName: string | null;
}

export interface CourseSectionOption {
  id: number;
  nrc: string;
  name: string;
  /** null when the professor account no longer exists or auth-service could not be reached */
  professor: CourseSectionProfessor | null;
}

export interface CourseSectionList {
  sections: CourseSectionOption[];
  /** false when auth-service failed: the sections are complete but have no professor names */
  professorsAvailable: boolean;
}

/**
 * Course sections (NRC) a student can pick when submitting a project to an event: the ones of
 * the academic term of the event.
 *
 * - An event that does not require a course section, or that has no term, has none to pick: the
 *   list is empty. The fill rows (-1 "no NRC", 0 "not applicable") are never listed.
 * - The professor names come from auth-service. They help the student recognise their section but
 *   the NRC and the course name are what the submission needs, so a failure of auth-service does
 *   not stop the list: the sections come back without professor and `professorsAvailable: false`.
 *   A professor whose account no longer exists has no name either, but that is not a failure.
 */
@Injectable()
export class ListCourseSectionsUC {
  private readonly logger = new Logger(ListCourseSectionsUC.name);

  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly eventService: EventServicePort,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
  ) {}

  async execute(input: { eventId: number }): Promise<CourseSectionList> {
    const event = await this.findEvent(input.eventId);
    if (!event) {
      throw new NotFoundError('El evento no existe en event-service');
    }

    const termId: number | undefined = event.termId;
    if (event.requiresCourse === false || !termId || termId === NO_TERM_ID) {
      return { sections: [], professorsAvailable: true };
    }

    const courses = await this.repo.listAcademicCoursesByTerm(termId);
    if (!courses.length) {
      return { sections: [], professorsAvailable: true };
    }

    const { professors, available } = await this.findProfessors(courses.map((course) => course.professorUserId));
    return {
      sections: courses.map((course) => ({
        id: course.id,
        nrc: course.nrc,
        name: course.name,
        professor: professors.get(course.professorUserId) ?? null,
      })),
      professorsAvailable: available,
    };
  }

  /** event-service answers a missing event with a gRPC NOT_FOUND error, not with null */
  private async findEvent(eventId: number) {
    try {
      return await this.eventService.getEventById(eventId);
    } catch (error) {
      if ((error as { code?: number })?.code === status.NOT_FOUND) return null;
      throw error;
    }
  }

  private withTimeout<T>(call: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`sin respuesta tras ${PROFESSORS_LOOKUP_TIMEOUT_MS} ms`)),
        PROFESSORS_LOOKUP_TIMEOUT_MS,
      );
    });
    return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
  }

  private async findProfessors(
    userIds: number[],
  ): Promise<{ professors: Map<number, CourseSectionProfessor>; available: boolean }> {
    try {
      const users = await this.withTimeout(this.auth.findUsersByIds(userIds));
      return {
        professors: new Map(
          users.map((user) => [
            user.id,
            { userId: user.id, firstName: user.firstName, lastName: user.lastName ?? null },
          ]),
        ),
        available: true,
      };
    } catch (error) {
      this.logger.warn(
        `No se pudieron consultar los profesores en auth-service; se listan los NRC sin nombres: ${(error as Error)?.message}`,
      );
      return { professors: new Map(), available: false };
    }
  }
}
