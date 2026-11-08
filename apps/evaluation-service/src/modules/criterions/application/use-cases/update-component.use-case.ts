import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { UpdateComponentDto } from '../dto/update-component.dto';
import { exceedsFullWeight, exceedsFullWeightMessage } from '@criterions/domain/services/rubric';

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
    if (weight !== undefined && (!(weight > 0) || weight > 1)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be greater than 0 and at most 1',
      });
    }

    const finalWeight = weight ?? existingComponent.weight;

    // The weight is part of every criterion's effective weight, so changing it alters the rubric used to grade
    if (finalWeight !== existingComponent.weight) {
      if (await this.criterionRepository.hasEvaluationsForEvent(existingComponent.eventId)) {
        throw new RpcException({
          code: status.FAILED_PRECONDITION,
          message: `Event ${existingComponent.eventId} already has evaluations; component weights cannot be modified`,
        });
      }

      const otherWeight = await this.criterionRepository.sumComponentWeightsByEvent(existingComponent.eventId, id);
      if (exceedsFullWeight(otherWeight, finalWeight, existingComponent.weight)) {
        throw new RpcException({
          code: status.INVALID_ARGUMENT,
          message: exceedsFullWeightMessage(existingComponent.eventId, otherWeight, finalWeight),
        });
      }
    }

    // The event of a component never changes
    const updatedComponent = new Component(
      id,
      name?.trim() ?? existingComponent.name,
      finalWeight,
      existingComponent.eventId,
    );

    return await this.criterionRepository.updateComponent(updatedComponent);
  }
}
