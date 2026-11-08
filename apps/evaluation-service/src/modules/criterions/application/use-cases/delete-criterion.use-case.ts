import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { DeleteCriterionDto } from '../dto/delete-criterion.dto';
import { CategoryLockService } from '../services/category-lock.service';

@Injectable()
export class DeleteCriterionUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
    private readonly categoryLock: CategoryLockService,
  ) {}

  async execute(deleteCriterionDto: DeleteCriterionDto): Promise<void> {
    const { id } = deleteCriterionDto;

    const existingCriterion = await this.criterionRepository.findById(id);
    if (!existingCriterion) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'Criterion not found with the provided ID',
      });
    }

    // Deleting a criterion changes the rubric of every category it belongs to
    const courseIds = (await this.criterionRepository.getCriterionCourses(id)).map((cc) => cc.course_id);
    await this.categoryLock.assertNotEvaluated(existingCriterion.eventId, courseIds);

    try {
      await this.criterionRepository.removeAllCourseAssociations(id);

      await this.criterionRepository.delete(id);
    } catch (error) {
      if (error instanceof RpcException) throw error;
      throw new RpcException({
        code: status.INTERNAL,
        message: 'Failed to delete criterion. Please try again later.',
      });
    }
  }
}
