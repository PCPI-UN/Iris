import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CourseRepository } from '../../domain/repositories/course.repository';
import { GetCourseDTO } from '../dto/get-course.dto';

@Injectable()
export class GetCourseUseCase {
  constructor(private repo: CourseRepository) {}

  async execute(input: GetCourseDTO) {
    const id = Number(input.id);                 
    const c = await this.repo.findById(id);      
    if (!c) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'No se encontró la categoría',
      });
    }
    return c;
  }
}
