import { Criterion } from '../entities/criterion.entity';
import { CriterionCourse } from '../entities/criterion-courses.entity';
import { Component } from '../entities/component.entity';

export interface PaginatedCriterions {
    criterions: Criterion[];
    total: number;
}

export interface FindAllFilters {
    eventId?: number;
    courseId?: number;
}
export abstract class CriterionRepositoryPort {
  abstract create(criterion: Criterion): Promise<Criterion>;
  abstract findById(id: number): Promise<Criterion | null>;
  abstract findAll(page: number, limit: number, filters?: FindAllFilters): Promise<PaginatedCriterions>;
  abstract update(criterion: Criterion): Promise<Criterion>;
  abstract delete(id: number): Promise<void>;
  abstract findByCourseId(courseId: number): Promise<Criterion[]>;
  abstract findByCourseIds(courseIds: number[]): Promise<Criterion[]>;
  
  // Métodos para manejar la relación con cursos
  abstract associateCourses(criterionId: number, courseIds: number[]): Promise<void>;
  abstract removeAllCourseAssociations(criterionId: number): Promise<void>;
  abstract getCriterionCourses(criterionId: number): Promise<CriterionCourse[]>;

  // Componentes
  abstract createComponent(name: string, weight: number, eventId?: number | null): Promise<Component>;
  abstract findComponentById(id: number): Promise<Component | null>;
  abstract findAllComponents(): Promise<Component[]>;
  abstract updateComponent(component: Component): Promise<Component>;
  abstract deleteComponent(id: number): Promise<void>;
  abstract countActiveCriteriaInComponent(componentId: number): Promise<number>;
  abstract sumComponentWeightsByEvent(eventId: number, excludeComponentId?: number): Promise<number>;

  // Una rúbrica con evaluaciones registradas no se puede modificar
  abstract hasEvaluationsForEvent(eventId: number): Promise<boolean>;
  abstract hasEvaluationsForComponent(componentId: number): Promise<boolean>;
}
