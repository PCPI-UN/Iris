import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { CreateCriterionDto } from '../dto/create-criterion.dto';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';

const DEFAULT_RELATIVE_WEIGHT = 1;

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
    const { eventId, name, description, category, componentId } = createCriterionDto;
    const weight = createCriterionDto.weight ?? DEFAULT_RELATIVE_WEIGHT;
    const courseIds = Array.from(new Set(createCriterionDto.courseIds ?? []));

    // Validate name is not empty
    if (!name || name.trim().length === 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Name is required and cannot be empty',
      });
    }

    // The weight is relative to the other criteria of the same component and category
    if (!(weight > 0)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be greater than 0',
      });
    }

    try {
      await this.eventService.getEvent(eventId);
    } catch {
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

    const component = await this.criterionRepository.findComponentById(componentId);
    if (!component) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `Component with ID ${componentId} not found`,
      });
    }
    if (component.eventId !== eventId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Component ${componentId} does not belong to event ${eventId}`,
      });
    }

    if (courseIds.length > 0) {
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
    }

    const criterion = new Criterion(
      0,
      eventId,
      name.trim(),
      description?.trim() || null,
      weight,
      true,
      category || null,
      componentId,
      new Date(),
      new Date(),
    );

    try {
      const savedCriterion = await this.criterionRepository.create(criterion);

      if (courseIds.length > 0) {
        await this.criterionRepository.associateCourses(savedCriterion.id, courseIds);
      }

      return {
        criterion: savedCriterion,
        courseIds,
        component,
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
