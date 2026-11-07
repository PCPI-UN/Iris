import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { UpdateCriterionDto } from '../dto/update-criterion.dto';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { CriterionCourse } from '@criterions/domain/entities/criterion-courses.entity';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';

@Injectable()
export class UpdateCriterionUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly eventService: EventServicePort,
  ) { }

  async execute(updateCriterionDto: UpdateCriterionDto): Promise<{
    criterion: Criterion;
    courseIds: number[];
    component?: Component;
  }> {
    const { id, eventId, name, description, weight, active, category, componentId } = updateCriterionDto;
    // A repeated proto field cannot be "unset": the gateway sends [] when the client did not send courses,
    // and a criterion always needs at least one course, so an empty list means "keep the current courses".
    // Duplicates are dropped so they cannot hide a change of courses.
    const courseIds = updateCriterionDto.courseIds?.length
      ? Array.from(new Set(updateCriterionDto.courseIds))
      : undefined;

    const existingCriterion = await this.criterionRepository.findById(id);
    if (!existingCriterion) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Criterion not found with the provided ID',
      });
    }

    if (name !== undefined && (!name || name.trim().length === 0)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Name cannot be empty',
      });
    }

    if (weight !== undefined && !(weight > 0)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be greater than 0',
      });
    }

    const finalEventId = eventId ?? existingCriterion.eventId;
    const finalComponentId = componentId ?? existingCriterion.componentId;

    if (!finalComponentId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'A criterion must belong to a component',
      });
    }

    // Only the texts can change once the event has evaluations; anything else alters the rubric used to grade.
    // Clients usually resend the whole form, so unchanged values must not count as a change.
    const currentCourseIds = (await this.criterionRepository.getCriterionCourses(id))
      .map((cc: CriterionCourse) => cc.course_id);
    const coursesChange =
      courseIds !== undefined &&
      (courseIds.length !== currentCourseIds.length ||
        courseIds.some((courseId) => !currentCourseIds.includes(courseId)));

    const changesRubric =
      coursesChange ||
      (weight !== undefined && weight !== existingCriterion.weight) ||
      (active !== undefined && active !== existingCriterion.active) ||
      finalEventId !== existingCriterion.eventId ||
      finalComponentId !== existingCriterion.componentId;

    if (changesRubric) {
      const eventIds = new Set([existingCriterion.eventId, finalEventId]);
      for (const affectedEventId of eventIds) {
        if (await this.criterionRepository.hasEvaluationsForEvent(affectedEventId)) {
          throw new RpcException({
            code: status.FAILED_PRECONDITION,
            message: `Event ${affectedEventId} already has evaluations; its criteria cannot be modified`,
          });
        }
      }
    }

    // If eventId is being updated, validate new event exists
    if (finalEventId !== existingCriterion.eventId) {
      try {
        await this.eventService.getEvent(finalEventId);
      } catch {
        throw new RpcException({
          code: status.NOT_FOUND,
          message: `Event with ID ${finalEventId} not found`,
        });
      }
    }

    const component = await this.criterionRepository.findComponentById(finalComponentId);
    if (!component) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `Component with ID ${finalComponentId} not found`,
      });
    }
    if (component.eventId !== finalEventId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Component ${finalComponentId} does not belong to event ${finalEventId}`,
      });
    }

    if (courseIds !== undefined) {
      const { valid, invalidCourses } = await this.eventService.validateCoursesBelongToEvent(
        courseIds,
        finalEventId,
      );

      if (!valid) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Courses [${invalidCourses.join(', ')}] do not belong to event ${finalEventId}`,
        });
      }
    }

    const updatedCriterion = new Criterion(
      id,
      finalEventId,
      name?.trim() ?? existingCriterion.name,
      description !== undefined ? (description?.trim() || null) : existingCriterion.description,
      weight ?? existingCriterion.weight,
      active ?? existingCriterion.active,
      category !== undefined ? (category || null) : existingCriterion.category,
      finalComponentId,
      existingCriterion.createdAt,
      new Date(),
    );

    try {
      const savedCriterion = await this.criterionRepository.update(updatedCriterion);

      if (coursesChange && courseIds) {
        await this.criterionRepository.removeAllCourseAssociations(id);
        await this.criterionRepository.associateCourses(id, courseIds);
      }

      return {
        criterion: savedCriterion,
        courseIds: coursesChange && courseIds ? courseIds : currentCourseIds,
        component,
      };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        code: status.INTERNAL,
        message: 'Failed to update criterion. Please try again later.',
      });
    }
  }
}
