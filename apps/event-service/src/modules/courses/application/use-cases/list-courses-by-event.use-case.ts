import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CourseRepository } from '../../domain/repositories/course.repository';
import { ListCoursesByEventDTO } from '../dto/list-courses-by-event.dto';

@Injectable()
export class ListCoursesByEventUseCase {
  constructor(private readonly repo: CourseRepository) {}

  async execute(input: ListCoursesByEventDTO) {
    const eventId = Number(input.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: 'eventId es obligatorio y debe ser mayor que 0',
      });
    }

    const page = input.page && input.page > 0 ? input.page : 1;
    const limit = input.limit && input.limit > 0 ? input.limit : 20;

    return this.repo.list({
      eventId,
      onlyActive: !!input.onlyActive,
      page,
      pageSize: limit,
      q: input.q,
    });
  }
}
