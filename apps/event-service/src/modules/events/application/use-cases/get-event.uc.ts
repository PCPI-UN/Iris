import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventRepository } from '@events/domain/repositories/event.repository';
import { GetEventDTO } from '@events/application/dto/get-event.dto';
import { getEventStatus } from '@events/domain/events/get-event-status.util';

@Injectable()
export class GetEventUC {
  constructor(private readonly repo: EventRepository) {}

  async execute(input: GetEventDTO) {
    const event = await this.repo.findById(input.id);
    if (!event) {
      throw new RpcException({
        code: 5,
        message: `No se encontró el evento con ID ${input.id}`,
      });
    }

    return {
      ...event,
      status: getEventStatus(
        event.startDate,
        event.endDate,
        event.inscriptionDeadline,
      ),
    };
  }
}
