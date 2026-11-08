import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { CreateComponentDto } from '../dto/create-component.dto';
import { areComponentsLocked, componentsLockedMessage } from '../services/component-lock';
import { exceedsFullWeight, exceedsFullWeightMessage } from '@criterions/domain/services/rubric';

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

    if (await areComponentsLocked(this.criterionRepository, eventId)) {
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: componentsLockedMessage(eventId),
      });
    }

    const otherWeight = await this.criterionRepository.sumComponentWeightsByEvent(eventId);
    if (exceedsFullWeight(otherWeight, weight)) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: exceedsFullWeightMessage(eventId, otherWeight, weight),
      });
    }

    return await this.criterionRepository.createComponent(name.trim(), weight, eventId);
  }
}
