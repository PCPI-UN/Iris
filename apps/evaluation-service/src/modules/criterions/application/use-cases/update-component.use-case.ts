import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { UpdateComponentDto } from '../dto/update-component.dto';
import { WEIGHT_SUM_TOLERANCE } from '../../../../common/utils/grade.utils';

@Injectable()
export class UpdateComponentUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
  ) {}

  async execute(updateComponentDto: UpdateComponentDto): Promise<Component> {
    const { id, name, weight } = updateComponentDto;

    // Get the existing component
    const existingComponent = await this.criterionRepository.findComponentById(id);

    if (!existingComponent) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `Component with ID ${id} not found`,
      });
    }

    // Validate name if provided
    if (name !== undefined && (!name || name.trim().length === 0)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Component name cannot be empty',
      });
    }

    // Validate weight if provided
    if (weight !== undefined && (weight < 0 || weight > 1)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be between 0 and 1',
      });
    }

    const finalWeight = weight ?? existingComponent.weight;
    const finalEventId = 'eventId' in updateComponentDto ? updateComponentDto.eventId ?? null : existingComponent.eventId;

    // The weight is split among the criteria, so changing it (or the event) alters the rubric used to grade
    const changesRubric = finalWeight !== existingComponent.weight || finalEventId !== existingComponent.eventId;
    if (changesRubric && await this.criterionRepository.hasEvaluationsForComponent(id)) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `Component ${id} is already used in evaluations; its weight cannot be modified`,
      });
    }

    if (finalEventId && changesRubric) {
      const otherWeight = await this.criterionRepository.sumComponentWeightsByEvent(finalEventId, id);
      if (otherWeight + finalWeight > 1 + WEIGHT_SUM_TOLERANCE) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: `Total component weight for event ${finalEventId} would exceed 100%. Other components: ${(otherWeight * 100).toFixed(2)}%, Requested: ${(finalWeight * 100).toFixed(2)}%`,
        });
      }
    }

    const updatedComponent = new Component(
      id,
      name ?? existingComponent.name,
      finalWeight,
      finalEventId,
    );

    return await this.criterionRepository.updateComponent(updatedComponent);
  }
}
