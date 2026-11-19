import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CriterionRepositoryPort } from '@criterions/domain/repositories/criterion.repository.port';
import { Component } from '@criterions/domain/entities/component.entity';
import { GetComponentDto } from '../dto/get-component.dto';

@Injectable()
export class GetComponentUseCase {
  constructor(
    private readonly criterionRepository: CriterionRepositoryPort,
  ) {}

  async execute(getComponentDto: GetComponentDto): Promise<Component> {
    const { id } = getComponentDto;

    const component = await this.criterionRepository.findComponentById(id);

    if (!component) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: `No se encontró el componente con ID ${id}`,
      });
    }

    return component;
  }
}
