import { Injectable } from '@nestjs/common';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { buildRubric } from '@criterions/domain/services/rubric';
import { EventServicePort } from '../../infrastructure/ports/event.service.port';

export interface CategoryReadiness {
  courseId: number;
  ready: boolean;
  criteriaCount: number;
  missingComponentIds: number[];
  criteriaWithoutComponent: number[];
}

export interface RubricReadiness {
  eventId: number;
  componentsWeight: number;
  components: Component[];
  categories: CategoryReadiness[];
}

/**
 * A category (course) of an event can be evaluated when the event components
 * add up to 100% and every component has at least one criterion of that category.
 * Every category of the event is reported, also the ones without any criterion.
 */
@Injectable()
export class GetRubricReadinessUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly eventService: EventServicePort,
  ) {}

  async execute(request: { eventId: number; courseId?: number }): Promise<RubricReadiness> {
    const { eventId, courseId } = request;

    const [components, criteriaWithCourses, eventCourseIds] = await Promise.all([
      this.criterionRepository.findComponentsByEvent(eventId),
      this.criterionRepository.findActiveByEventWithCourses(eventId),
      courseId === undefined ? this.eventService.listCourseIdsByEvent(eventId) : Promise.resolve([courseId]),
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
        };
      });

    return {
      eventId,
      componentsWeight: components.reduce((sum, component) => sum + component.weight, 0),
      components,
      categories,
    };
  }
}
