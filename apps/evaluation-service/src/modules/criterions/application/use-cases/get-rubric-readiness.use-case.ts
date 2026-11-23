import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { buildRubric } from '@criterions/domain/services/rubric';
import { areComponentsLocked } from '../services/component-lock';
import { CategoryLockService } from '../services/category-lock.service';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';

export interface CategoryReadiness {
  courseId: number;
  ready: boolean;
  criteriaCount: number;
  missingComponentIds: number[];
  criteriaWithoutComponent: number[];
  /** The category has evaluated projects: its criteria can no longer change */
  locked: boolean;
}

export interface RubricReadiness {
  eventId: number;
  componentsWeight: number;
  components: Component[];
  categories: CategoryReadiness[];
  /** The event has evaluations: its components can no longer change */
  componentsLocked: boolean;
}

/**
 * A category (course) of an event can be evaluated when the event components
 * add up to 100% and every component has at least one criterion of that category.
 * Every category of the event is reported, also the ones without any criterion.
 * It also tells what can no longer change because of evaluations (same rules as when saving),
 * so clients can disable those fields instead of waiting for FAILED_PRECONDITION.
 * The flags are informational: saving revalidates them. `componentsLocked` counts every evaluation of the
 * event, while `locked` only counts evaluated projects that still exist (as when saving a criterion), so
 * after deleting the only evaluated project the components stay locked and no category is.
 */
@Injectable()
export class GetRubricReadinessUseCase {
  private readonly logger = new Logger(GetRubricReadinessUseCase.name);

  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly eventService: EventServicePort,
    private readonly categoryLockService: CategoryLockService,
  ) {}

  async execute(request: { eventId: number; courseId?: number }): Promise<RubricReadiness> {
    const { eventId, courseId } = request;

    if (courseId !== undefined) {
      const { valid } = await this.eventService.validateCoursesBelongToEvent([courseId], eventId);
      if (!valid) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `La categoría ${courseId} no pertenece al evento ${eventId}`,
        });
      }
    }

    const [components, criteriaWithCourses, eventCourseIds, componentsLocked, evaluatedCategoryIds] = await Promise.all([
      this.criterionRepository.findComponentsByEvent(eventId),
      this.criterionRepository.findActiveByEventWithCourses(eventId),
      courseId === undefined ? this.eventService.listCourseIdsByEvent(eventId) : Promise.resolve([courseId]),
      areComponentsLocked(this.criterionRepository, eventId),
      this.findEvaluatedCategoryIds(eventId),
    ]);

    const criteriaByCourse = new Map<number, Criterion[]>(
      eventCourseIds.map((eventCourseId) => [eventCourseId, []]),
    );
    for (const { criterion, courseIds } of criteriaWithCourses) {
      for (const criterionCourseId of courseIds) {
        if (courseId !== undefined && criterionCourseId !== courseId) continue;
        const group = criteriaByCourse.get(criterionCourseId) ?? [];
        group.push(criterion);
        criteriaByCourse.set(criterionCourseId, group);
      }
    }

    const categories = Array.from(criteriaByCourse.entries())
      .sort(([a], [b]) => a - b)
      .map(([categoryId, criteria]) => {
        const rubric = buildRubric(components, criteria);
        return {
          courseId: categoryId,
          ready: rubric.ready,
          criteriaCount: criteria.length,
          missingComponentIds: rubric.missingComponentIds,
          criteriaWithoutComponent: rubric.criteriaWithoutComponent,
          locked: evaluatedCategoryIds.has(categoryId),
        };
      });

    return {
      eventId,
      componentsWeight: components.reduce((sum, component) => sum + component.weight, 0),
      components,
      categories,
      componentsLocked,
    };
  }

  /**
   * Finding the evaluated categories asks project-service for the category of the evaluated projects. If it fails, the
   * rubric is still shown (without category locks) rather than breaking the screen; saving still rejects.
   */
  private async findEvaluatedCategoryIds(eventId: number): Promise<Set<number>> {
    try {
      return await this.categoryLockService.findEvaluatedCategoryIds(eventId);
    } catch (error) {
      this.logger.warn(
        `Could not tell which categories of event ${eventId} have evaluations: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Set();
    }
  }
}
