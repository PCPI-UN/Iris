import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort, PaginatedCriterions } from '@criterions/domain/repositories/criterion.repository.port';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { CriterionCourse } from '@criterions/domain/entities/criterion-courses.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { ListCriterionsDto } from '../dto/list-criterions.dto';

@Injectable()
export class ListCriterionsUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
  ) {}

  async execute(listCriterionsDto: ListCriterionsDto): Promise<{
    criterions: Array<{ criterion: Criterion; courseIds: number[]; component?: Component }>;
    total: number;
  }> {
    const { eventId, courseId, page = 1, limit = 10 } = listCriterionsDto;

    try {
      const filters: { eventId?: number; courseId?: number } = {};

      if (eventId !== undefined) {
        filters.eventId = eventId;
      }

      if (courseId !== undefined) {
        filters.courseId = courseId;
      }

      const { criterions, total } = await this.criterionRepository.findAll(page, limit, filters);

      // Fetch courseIds and component for each criterion
      const criterionsWithCourses = await Promise.all(
        criterions.map(async (criterion: Criterion) => {
          const courses = await this.criterionRepository.getCriterionCourses(criterion.id);
          let component: Component | undefined;
          if (criterion.componentId) {
            const found = await this.criterionRepository.findComponentById(criterion.componentId);
            if (found) {
              component = found;
            }
          }
          return {
            criterion,
            courseIds: courses.map((c: CriterionCourse) => c.course_id),
            ...(component && { component }),
          };
        })
      );

      return { criterions: criterionsWithCourses, total };

    } catch (error) {
      throw new RpcException({
        code: status.INTERNAL,
        message: 'No se pudieron obtener los criterios. Intenta de nuevo más tarde.',
      });
    }
  }
}