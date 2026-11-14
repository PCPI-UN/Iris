import { Injectable } from '@nestjs/common';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Criterion } from '@criterions/domain/entities/criterion.entity';
import { FindByCourseDto } from '../dto/find-by-course.dto';

@Injectable()
export class FindByCourseUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
  ) {}

  async execute(findByCourseDto: FindByCourseDto): Promise<{ criterions: Criterion[]; components: any[] }> {
    const { courseId } = findByCourseDto;

    const criterions = (await this.criterionRepository.findByCourseId(courseId)) || [];

    // Only the components of the events the course criteria belong to
    const eventIds = Array.from(new Set(criterions.map((criterion) => criterion.eventId)));
    const components = (
      await Promise.all(eventIds.map((eventId) => this.criterionRepository.findComponentsByEvent(eventId)))
    ).flat();

    return {
      criterions,
      components,
    };
  }
}