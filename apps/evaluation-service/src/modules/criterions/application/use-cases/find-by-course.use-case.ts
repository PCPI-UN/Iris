import { Injectable } from '@nestjs/common';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { Component } from '@criterions/domain/entities/component.entity';
import { buildRubric } from '@criterions/domain/services/rubric';
import { FindByCourseDto } from '../dto/find-by-course.dto';

@Injectable()
export class FindByCourseUseCase {
  constructor(private readonly criterionRepository: CriterionRepositoryPort) {}

  async execute(findByCourseDto: FindByCourseDto): Promise<{
    criterions: Criterion[];
    components: Component[];
    effectiveWeights: Map<number, number>;
  }> {
    const { courseId } = findByCourseDto;

    const criterions =
      (await this.criterionRepository.findByCourseId(courseId)) || [];

    // Only the components of the events the course criteria belong to
    const eventIds = Array.from(
      new Set(criterions.map((criterion) => criterion.eventId)),
    );
    const components = (
      await Promise.all(
        eventIds.map((eventId) =>
          this.criterionRepository.findComponentsByEvent(eventId),
        ),
      )
    ).flat();

    // Same rubric the grade is computed with (`evaluate-project.use-case.ts`), one per event
    const effectiveWeights = new Map<number, number>();
    for (const eventId of eventIds) {
      const rubric = buildRubric(
        components.filter((component) => component.eventId === eventId),
        criterions.filter((criterion) => criterion.eventId === eventId),
      );
      rubric.effectiveWeights.forEach((weight, criterionId) =>
        effectiveWeights.set(criterionId, weight),
      );
    }

    return {
      criterions,
      components,
      effectiveWeights,
    };
  }
}
