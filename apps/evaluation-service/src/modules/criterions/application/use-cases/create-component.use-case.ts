import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { CreateComponentDto } from '../dto/create-component.dto';
import { WEIGHT_SUM_TOLERANCE } from '../../../../common/utils/grade.utils';

@Injectable()
export class CreateComponentUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
  ) {}

  async execute(createComponentDto: CreateComponentDto): Promise<Component> {
    const { name, weight, eventId } = createComponentDto;

    if (!name || name.trim().length === 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Component name is required and cannot be empty',
      });
    }

    if (!eventId) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'A component must belong to an event',
      });
    }

    if (!(weight > 0) || weight > 1) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'Weight must be greater than 0 and at most 1',
      });
    }

    if (await this.criterionRepository.hasEvaluationsForEvent(eventId)) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: `Event ${eventId} already has evaluations; its components cannot be modified`,
      });
    }

    const otherWeight = await this.criterionRepository.sumComponentWeightsByEvent(eventId);
    if (otherWeight + weight > 1 + WEIGHT_SUM_TOLERANCE) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: `Total component weight for event ${eventId} would exceed 100%. Current: ${(otherWeight * 100).toFixed(2)}%, Requested: ${(weight * 100).toFixed(2)}%`,
      });
    }

    return await this.criterionRepository.createComponent(name.trim(), weight, eventId);
  }
}
