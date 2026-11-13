import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { CreateProjectDTO } from '../dto/create-project.dto';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { EventServicePort } from '../ports/event-service.port';
import { EVENT_SERVICE_PORT } from '../ports/event-service.port';

@Injectable()
export class CreateProjectUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT)
    private readonly eventService: EventServicePort
) {}

  async execute(input: CreateProjectDTO) {

    // 1. Validate event
    const event = await this.eventService.getEventById(input.eventId);
    if (!event) {
      throw new NotFoundError('El evento no existe en event-service');
    }
    if (event.active === false) {
      throw new ValidationError('El evento está inactivo');
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
    const existing = await this.repo.findProject(input.eventId, input.courseId, input.name.trim());
    if (existing) {
      throw new ValidationError('Ya existe un proyecto con el mismo nombre en este evento y categoría');
    }
  
    // 3. Validate that the event registration deadline has not passed
    const currentDate = new Date();
    const registrationDeadline = new Date(event.inscriptionDeadline);
    
    // Compare only dates, without considering the time
    const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const deadlineDateOnly = new Date(registrationDeadline.getFullYear(), registrationDeadline.getMonth(), registrationDeadline.getDate());
    
    if (deadlineDateOnly < currentDateOnly) {
      throw new ValidationError('La fecha límite de inscripción del evento ya pasó');
    }
    
    // 4. Verify that the event is publicly joinable
    if (!event.isPubliclyJoinable) {
      throw new ValidationError('El evento no permite inscripción pública');
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
    });
  }
}
