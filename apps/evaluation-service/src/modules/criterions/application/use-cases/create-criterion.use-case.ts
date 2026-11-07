import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { CreateCriterionDto } from '../dto/create-criterion.dto';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';
import { WEIGHT_SUM_TOLERANCE } from '../../../../common/utils/grade.utils';

@Injectable()
export class CreateCriterionUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly eventService: EventServicePort,
  ) { }

  async execute(createCriterionDto: CreateCriterionDto): Promise<{
    criterion: Criterion;
    courseIds: number[];
    component?: Component;
  }> {
    const { eventId, name, description, weight, courseIds, category, componentId } = createCriterionDto;

    // Validate name is not empty
    if (!name || name.trim().length === 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Name is required and cannot be empty',
      });
    }

    try {
      await this.eventService.getEvent(eventId);
    } catch (error) {
      console.log('Error fetching event:', error);
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `Event with ID ${eventId} not found`,
      });
    }

    if (await this.criterionRepository.hasEvaluationsForEvent(eventId)) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `Event ${eventId} already has evaluations; its criteria cannot be modified`,
      });
    }

    // A criterion inside a component gets its weight from the component (split in equal parts)
    let component: Component | undefined;
    if (componentId) {
      const found = await this.criterionRepository.findComponentById(componentId);
      if (!found) {
        throw new RpcException({
          code: status.NOT_FOUND,
          message: `Component with ID ${componentId} not found`,
        });
      }
      if (found.eventId !== null && found.eventId !== eventId) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Component ${componentId} does not belong to event ${eventId}`,
        });
      }
      component = found;
    } else if (weight <= 0 || weight > 1) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be between 0 and 1',
      });
    }

    if (courseIds && courseIds.length > 0) {
      // Validate courses belong to the event
      const { valid, invalidCourses } = await this.eventService.validateCoursesBelongToEvent(
        courseIds,
        eventId,
      );

      if (!valid) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Courses [${invalidCourses.join(', ')}] do not belong to event ${eventId}`,
        });
      }

      // Criteria without component carry their own weight: validate that total weight per course doesn't exceed 100%
      if (!component) {
        for (const courseId of courseIds) {
          const existingCriteria = await this.criterionRepository.findByCourseId(courseId);

          // Calculate total weight of active criteria
          const totalWeight = existingCriteria
            .filter((c: Criterion) => c.active)
            .reduce((sum: number, c: Criterion) => sum + c.weight, 0);

          // Check if adding new criterion would exceed 100%
          if (totalWeight + weight > 1 + WEIGHT_SUM_TOLERANCE) {
            throw new RpcException({
              code: status.INVALID_ARGUMENT,
              message: `Total weight for course ${courseId} would exceed 100%. Current: ${(totalWeight * 100).toFixed(2)}%, Requested: ${(weight * 100).toFixed(2)}%, Total: ${((totalWeight + weight) * 100).toFixed(2)}%`,
            });
          }
        }
      }
    }

    const criterion = new Criterion(
      0,
      eventId,
      name.trim(),
      description?.trim() || null,
      component ? 0 : weight,
      true,
      category || null,
      componentId || null,
      new Date(),
      new Date(),
    );

    try {
      const savedCriterion = await this.criterionRepository.create(criterion);

      if (courseIds && courseIds.length > 0) {
        await this.criterionRepository.associateCourses(savedCriterion.id, courseIds);
      }

      return {
        criterion: savedCriterion,
        courseIds: courseIds || [],
        ...(component && { component }),
      };
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        code: status.INTERNAL,
        message: 'Failed to create criterion. Please try again later.',
      });
    }
  }
}
