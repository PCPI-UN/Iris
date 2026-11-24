import {
  CriterionProto,
  ListCriterionsResponse,
  DeleteCriterionResponse,
  FindCriterionsByCourseResponse,
  PaginationMetadata,
  CriterionCategoryProto,
  CriterionSummary
} from '@app/common/generated/evaluation';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { buildRubric } from '@criterions/domain/services/rubric';

export class CriterionMapper {
  static toCreateCriterionResponse(
    result: { criterion: Criterion; courseIds: number[]; component?: Component }
  ): CriterionProto {
    return {
      id: result.criterion.id,
      eventId: result.criterion.eventId,
      name: result.criterion.name,
      weight: result.criterion.weight,
      active: result.criterion.active,
      courseIds: result.courseIds,
      ...(result.criterion.description && { description: result.criterion.description }),
      ...(result.criterion.category && { category: result.criterion.category }),
      ...(result.component && { component: { id: result.component.id, name: result.component.name, weight: result.component.weight, ...(result.component.eventId != null && { eventId: result.component.eventId }) } }),
    };
  }

  static toUpdateCriterionResponse(
    result: { criterion: Criterion; courseIds: number[]; component?: Component }
  ): CriterionProto {
    return {
      id: result.criterion.id,
      eventId: result.criterion.eventId,
      name: result.criterion.name,
      ...(result.criterion.description && { description: result.criterion.description }),
      weight: result.criterion.weight,
      active: result.criterion.active,
      courseIds: result.courseIds,
      ...(result.criterion.category && { category: result.criterion.category }),
      ...(result.component && { component: { id: result.component.id, name: result.component.name, weight: result.component.weight, ...(result.component.eventId != null && { eventId: result.component.eventId }) } }),
    };
  }

  static toGetCriterionResponse(
    result: { criterion: Criterion; courseIds: number[]; component?: Component }
  ): CriterionProto {
    return {
      id: result.criterion.id,
      eventId: result.criterion.eventId,
      name: result.criterion.name,
      ...(result.criterion.description && { description: result.criterion.description }),
      weight: result.criterion.weight,
      active: result.criterion.active,
      courseIds: result.courseIds,
      ...(result.criterion.category && { category: result.criterion.category }),
      ...(result.component && { component: { id: result.component.id, name: result.component.name, weight: result.component.weight, ...(result.component.eventId != null && { eventId: result.component.eventId }) } }),
    };
  }

  static toListCriterionsResponse(
    result: {
      criterions: Array<{ criterion: Criterion; courseIds: number[]; component?: Component }>;
      total: number;
    },
    page: number,
    limit: number
  ): ListCriterionsResponse {

    const meta: PaginationMetadata = {
      total: result.total,
      itemsOnCurrentPage: result.criterions.length,
      currentPage: page,
      itemsPerPage: limit,
      totalPages: Math.ceil(result.total / limit),
    }

    return {
      criterions: result.criterions.map(({ criterion, courseIds, component }) => ({
        id: criterion.id,
        eventId: criterion.eventId,
        name: criterion.name,
        ...(criterion.description && { description: criterion.description }),
        weight: criterion.weight,
        active: criterion.active,
        courseIds,
        ...(criterion.category && { category: criterion.category }),
        ...(component && { component: { id: component.id, name: component.name, weight: component.weight, ...(component.eventId != null && { eventId: component.eventId }) } }),
      })),
      meta,
    };
  }

  static toDeleteCriterionResponse(success: boolean): DeleteCriterionResponse {
    return {
      success,
      message: success ? 'Criterion deleted successfully' : 'Failed to delete criterion',
    };
  }

  static toFindCriterionsByCourseResponse(
    criterions: Criterion[],
    components: Component[]
  ): FindCriterionsByCourseResponse {
    // Build a map of component ID to weight for quick lookup
    const componentWeights: Record<number, number> = {};
    components.forEach(component => {
      componentWeights[component.id] = component.weight;
    });

    // Same rubric the grade is computed with (`evaluate-project.use-case.ts`), one per event
    const effectiveWeights = new Map<number, number>();
    for (const eventId of new Set(
      criterions.map((criterion) => criterion.eventId),
    )) {
      const rubric = buildRubric(
        components.filter((component) => component.eventId === eventId),
        criterions.filter((criterion) => criterion.eventId === eventId),
      );
      rubric.effectiveWeights.forEach((weight, criterionId) =>
        effectiveWeights.set(criterionId, weight),
      );
    }

    const groupedCriterions = criterions.reduce((acc, criterion) => {
      const componentId = criterion.componentId;
      
      // Group by component ID, or by "Uncategorized" if no component
      const groupKey = componentId ? `component_${componentId}` : 'Uncategorized';
      
      if (!acc[groupKey]) {
        acc[groupKey] = {
          componentId,
          criterions: [],
        };
      }
      const weight = effectiveWeights.get(criterion.id);
      acc[groupKey].criterions.push({
        id: criterion.id,
        name: criterion.name,
        ...(weight !== undefined && { weight }),
      });
      return acc;
    }, {} as Record<string, { componentId: number | null; criterions: CriterionSummary[] }>);

    // Create component map for easy lookup
    const componentMap: Record<number, Component> = {};
    components.forEach(component => {
      componentMap[component.id] = component;
    });

    const categories: CriterionCategoryProto[] = Object.entries(groupedCriterions).map(
      ([groupKey, group]: [string, { componentId: number | null; criterions: CriterionSummary[] }]) => {
        let category: string;
        let weight: number;

        if (group.componentId && componentMap[group.componentId]) {
          // Use component name and weight
          category = componentMap[group.componentId].name;
          weight = componentMap[group.componentId].weight;
        } else {
          // Uncategorized criterions
          category = 'Uncategorized';
          weight = 0;
        }

        return {
          category,
          weight,
          criterions: group.criterions,
        };
      }
    );

    return {
      categories,
    };
  }
}