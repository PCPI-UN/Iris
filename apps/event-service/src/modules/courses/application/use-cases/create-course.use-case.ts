import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CourseRepository } from '../../domain/repositories/course.repository';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { CreateCourseDTO } from '../dto/create-course.dto';

@Injectable()
export class CreateCourseUseCase {
  constructor(
    private repo: CourseRepository,
    private eventRepo: EventRepository,
  ) {}

  async execute(input: CreateCourseDTO) {
    // Validate event exists
    const event = await this.eventRepo.findById(input.eventId);
    if (!event) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró el evento',
      });
    }

    const exists = await this.repo.existsByEventAndCode(input.eventId, input.code);
    if (exists) {
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: 'Ya existe una categoría con este código en el evento',
      });
    }
    return this.repo.create(input);
  }
}
