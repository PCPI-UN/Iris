import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { CreateProjectDTO } from '../dto/create-project.dto';
import { NotFoundError, ValidationError } from '../../domain/errors';
import {
  NOT_APPLICABLE_ACADEMIC_COURSE_ID,
  NO_TERM_ID,
  isFillAcademicCourse,
} from '../../domain/entities/project.entity';
import { EventServicePort } from '../ports/event-service.port';
import { EVENT_SERVICE_PORT } from '../ports/event-service.port';
import { isInscriptionDeadlinePassed } from '@app/common/utils/bogota-date.util';
import { EventResultsPublishedError } from '../../domain/admin-project-creation';

export interface CreateProjectOptions {
  /**
   * An administrator creates the project (manage:projects): the inscription deadline and
   * isPubliclyJoinable do not apply, but an event with published results is closed. Set only
   * by the use cases behind the administrative routes, never from a request field.
   */
  administrative?: boolean;
}

@Injectable()
export class CreateProjectUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT)
    private readonly eventService: EventServicePort,
  ) {}

  async execute(input: CreateProjectDTO, opts: CreateProjectOptions = {}) {
    // 1. Validate event
    const event = await this.eventService.getEventById(input.eventId);
    if (!event) {
      throw new NotFoundError('El evento no existe en event-service');
    }
    if (event.active === false) {
      throw new ValidationError('El evento está inactivo');
    }
    if (opts.administrative && event.resultsPublished === true) {
      throw new EventResultsPublishedError();
    }

    // 2. If courseId is provided, validate it exists and belongs to the event
    if (input.courseId) {
      const course = await this.eventService.getCourseById(input.courseId);
      if (!course) {
        throw new NotFoundError('El curso no existe en event-service');
      }
      if (course.eventId !== input.eventId) {
        throw new ValidationError('El curso no pertenece a ese evento');
      }
    }

    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError('El nombre del proyecto es obligatorio');
    }

    if (!input.courseId || input.courseId <= 0) {
      throw new ValidationError('courseId no es válido');
    }
    // Ensure no other project with the same name exists for this event and course
    const existing = await this.repo.findProject(
      input.eventId,
      input.courseId,
      input.name.trim(),
    );
    if (existing) {
      throw new ValidationError(
        'Ya existe un proyecto con el mismo nombre en este evento y categoría',
      );
    }

    // Every project belongs to a course section. An event that is not course work gives
    // course section 0 ("not applicable"), whatever the student sent; otherwise the NRC is
    // looked up in the term of the event, since the same NRC repeats across terms. This is
    // where "0 only for an event that does not require a course" is enforced: the event lives
    // in another database, so no constraint can
    const academicCourseId =
      event.requiresCourse === false
        ? NOT_APPLICABLE_ACADEMIC_COURSE_ID
        : await this.resolveAcademicCourse(event.termId, input.nrc);

    if (!opts.administrative) {
      // 3. Validate that the event registration deadline has not passed
      // The deadline day counts in full, in Bogotá time (the container runs in UTC)
      if (isInscriptionDeadlinePassed(event.inscriptionDeadline)) {
        throw new ValidationError(
          'La fecha límite de inscripción del evento ya pasó',
        );
      }

      // 4. Verify that the event is publicly joinable
      if (!event.isPubliclyJoinable) {
        throw new ValidationError('El evento no permite inscripción pública');
      }
    }

    const state = input.state ?? 'UNDER_REVIEW';
    return this.repo.create({
      eventId: input.eventId,
      courseId: input.courseId,
      name: input.name.trim(),
      projectCode: input.projectCode,
      description: input.description,
      eventNumber: input.eventNumber,
      state,
      academicCourseId,
    });
  }

  private async resolveAcademicCourse(
    termId: number | undefined,
    nrc: string | undefined,
  ): Promise<number> {
    const code = nrc?.trim();
    if (!code) {
      throw new ValidationError('El NRC del curso es obligatorio');
    }
    if (!termId || termId === NO_TERM_ID) {
      throw new ValidationError(
        'El evento no tiene periodo académico, así que no se puede ubicar el NRC',
      );
    }
    const academicCourseId = await this.repo.findAcademicCourseId(termId, code);
    if (academicCourseId === null || isFillAcademicCourse(academicCourseId)) {
      throw new ValidationError(
        `El NRC ${code} no existe en el periodo del evento`,
      );
    }
    return academicCourseId;
  }
}
