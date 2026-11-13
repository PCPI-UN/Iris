import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventRepository } from '../../domain/repositories/event.repository';
import { DeleteEventDTO } from '../dto/delete-event.dto';

@Injectable()
export class DeleteEventUC {
  constructor(private readonly repo: EventRepository) {}

  async execute(input: DeleteEventDTO) {
    const exists = await this.repo.findById(input.id);
    if (!exists) {
      throw new RpcException({
        code: 5,
        message: `No se encontró el evento con ID ${input.id}`,
      });
    }

    // Soft delete: sets active = false
    await this.repo.delete(input.id);
  }
}
