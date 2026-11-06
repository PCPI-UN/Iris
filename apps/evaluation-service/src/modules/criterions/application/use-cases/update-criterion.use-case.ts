import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { UpdateCriterionDto } from '../dto/update-criterion.dto';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { CriterionCourse } from '@criterions/domain/entities/criterion-courses.entity';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';
import { WEIGHT_SUM_TOLERANCE } from '../../../../common/utils/grade.utils';

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
    const courseIds = updateCriterionDto.courseIds?.length ? updateCriterionDto.courseIds : undefined;

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

    const finalEventId = eventId ?? existingCriterion.eventId;
    const finalComponentId = componentId !== undefined ? (componentId || null) : existingCriterion.componentId;

    // Only the texts can change once the event has evaluations; anything else alters the rubric used to grade.
    // Clients usually resend the whole form, so unchanged values must not count as a change.
    const currentCourseIds = (await this.criterionRepository.getCriterionCourses(id))
      .map((cc: CriterionCourse) => cc.course_id);
    const coursesChange =
      courseIds !== undefined &&
      (courseIds.length !== currentCourseIds.length ||
        courseIds.some((courseId) => !currentCourseIds.includes(courseId)));
    // Inside a component the weight is derived, so a weight sent by the client is ignored
    const weightChanges = !finalComponentId && weight !== undefined && weight !== existingCriterion.weight;

    const changesRubric =
      weightChanges ||
      coursesChange ||
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
    if (eventId !== undefined && eventId !== existingCriterion.eventId) {
      try {
        await this.eventService.getEvent(eventId);
      } catch (error) {
        throw new RpcException({
          code: status.NOT_FOUND,
          message: `Event with ID ${eventId} not found`,
        });
      }
    }

    // A criterion inside a component gets its weight from the component (split in equal parts)
    let component: Component | undefined;
    if (finalComponentId) {
      const found = await this.criterionRepository.findComponentById(finalComponentId);
      if (!found) {
        throw new RpcException({
          code: status.NOT_FOUND,
          message: `Component with ID ${finalComponentId} not found`,
        });
      }
      if (found.eventId !== null && found.eventId !== finalEventId) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Component ${finalComponentId} does not belong to event ${finalEventId}`,
        });
      }
      component = found;
    } else if (weight !== undefined && (weight <= 0 || weight > 1)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be between 0 and 1',
      });
    }

    let coursesToValidate: number[] | undefined = courseIds;

    // If courses are being updated, validate them
    if (courseIds !== undefined && courseIds.length > 0) {
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

      coursesToValidate = courseIds;
    } else if (courseIds === undefined) {
      // If courses are not being updated, use existing courses for weight validation
      coursesToValidate = currentCourseIds;
    }

    const finalWeight = component ? existingCriterion.weight : (weight ?? existingCriterion.weight);

    // Criteria without component carry their own weight: validate the course total if weight or courses change
    if (!component && coursesToValidate && coursesToValidate.length > 0 && (weight !== undefined || courseIds !== undefined)) {
      for (const courseId of coursesToValidate) {
        // Get all criteria for this course EXCLUDING current criterion
        const otherCriteria = (await this.criterionRepository.findByCourseId(courseId))
          .filter((c: Criterion) => c.id !== id && c.active);

        const otherWeight = otherCriteria.reduce((sum: number, c: Criterion) => sum + c.weight, 0);

        // Check if updated weight would exceed 100%
        if (otherWeight + finalWeight > 1 + WEIGHT_SUM_TOLERANCE) {
          throw new RpcException({
            code: status.INVALID_ARGUMENT,
            message: `Updated weight for course ${courseId} would exceed 100%. Other criteria: ${(otherWeight * 100).toFixed(2)}%, Requested: ${(finalWeight * 100).toFixed(2)}%, Total: ${((otherWeight + finalWeight) * 100).toFixed(2)}%`,
          });
        }
      }
    }

    const updatedCriterion = new Criterion(
      id,
      finalEventId,
      name?.trim() ?? existingCriterion.name,
      description !== undefined ? (description?.trim() || null) : existingCriterion.description,
      finalWeight,
      active ?? existingCriterion.active,
      category !== undefined ? (category || null) : existingCriterion.category,
      finalComponentId,
      existingCriterion.createdAt,
      new Date(),
    );

    try {
      const savedCriterion = await this.criterionRepository.update(updatedCriterion);

      if (courseIds !== undefined) {
        await this.criterionRepository.removeAllCourseAssociations(id);

        if (courseIds.length > 0) {
          await this.criterionRepository.associateCourses(id, courseIds);
        }
      }

      // Get final courseIds to return
      const finalCourseIds = courseIds !== undefined
        ? courseIds
        : (await this.criterionRepository.getCriterionCourses(id)).map((cc: CriterionCourse) => cc.course_id);

      return {
        criterion: savedCriterion,
        courseIds: finalCourseIds,
        ...(component && { component }),
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
