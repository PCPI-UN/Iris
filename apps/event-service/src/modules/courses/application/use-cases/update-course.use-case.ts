import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CourseRepository } from '../../domain/repositories/course.repository';
import { UpdateCourseDTO } from '../dto/update-course.dto';

@Injectable()
export class UpdateCourseUseCase {
  constructor(private repo: CourseRepository) {}

  async execute(input: UpdateCourseDTO) {
    // Validar existencia
    const current = await this.repo.findById(input.id);
    if (!current) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró la categoría',
      });
    }

    // Validar unicidad del código dentro del mismo evento
    if (input.code && input.code !== current.code) {
      const exists = await this.repo.existsByEventAndCode(current.eventId, input.code);
      if (exists) {
        throw new RpcException({
          code: status.ALREADY_EXISTS,
          message: 'Ya existe una categoría con este código en el evento',
        });
      }
    }

    // Actualizar curso
    return this.repo.update(input.id, {
      code: input.code,
      description: input.description,
      active: input.active,
    });
  }
}

