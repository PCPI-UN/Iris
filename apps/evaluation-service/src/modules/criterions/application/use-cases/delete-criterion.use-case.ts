import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { DeleteCriterionDto } from '../dto/delete-criterion.dto';

@Injectable()
export class DeleteCriterionUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
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

    if (await this.criterionRepository.hasEvaluationsForEvent(existingCriterion.eventId)) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `Event ${existingCriterion.eventId} already has evaluations; its criteria cannot be modified`,
      });
    }

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
