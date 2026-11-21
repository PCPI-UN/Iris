import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { DeleteComponentDto } from '../dto/delete-component.dto';
import { areComponentsLocked, componentsLockedMessage } from '../services/component-lock';

@Injectable()
export class DeleteComponentUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
  ) {}

  async execute(deleteComponentDto: DeleteComponentDto): Promise<void> {
    const component = await this.criterionRepository.findComponentById(deleteComponentDto.id);
    if (!component) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el componente con ID ${deleteComponentDto.id}`,
      });
    }

    // The rubric checks and the write run under the rubric lock of the event
    await this.criterionRepository.withRubricLock([component.eventId], 'exclusive', () =>
      this.delete(deleteComponentDto),
    );
  }

  private async delete(deleteComponentDto: DeleteComponentDto): Promise<void> {
    const { id } = deleteComponentDto;

    // Verify component exists
    const component = await this.criterionRepository.findComponentById(id);

    if (!component) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el componente con ID ${id}`,
      });
    }

    // Removing a component changes the total weight of the event rubric
    if (await areComponentsLocked(this.criterionRepository, component.eventId)) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: componentsLockedMessage(component.eventId),
      });
    }

    const activeCriteria = await this.criterionRepository.countActiveCriteriaInComponent(id);
    if (activeCriteria > 0) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `El componente ${id} todavía tiene ${activeCriteria} criterios activos; elimínalos o muévelos primero`,
      });
    }

    await this.criterionRepository.deleteComponent(id);
  }
}
