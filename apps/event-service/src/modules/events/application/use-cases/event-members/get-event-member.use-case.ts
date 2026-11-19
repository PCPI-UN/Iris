import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventMemberRepository } from '../../../domain/repositories/event-member.repository';
import { EventRepository } from '../../../domain/repositories/event.repository';
import { GetEventMemberDTO } from '../../dto/event-members/get-event-member.dto';
import { EventMember } from '../../../domain/entities/event-member.entity';

@Injectable()
export class FindEventMemberByUserAndEventUseCase {
  constructor(
    private readonly eventMemberRepository: EventMemberRepository,
    private readonly eventRepository: EventRepository,
  ) {}

  async execute(input: GetEventMemberDTO): Promise<EventMember | null> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) {
      throw new RpcException({
        code: 5,
        message: `No se encontró el evento con ID ${input.eventId}`,
      });
    }

    // Return active membership (or null if not found)
    return this.eventMemberRepository.findActiveByUserAndEvent(
      input.userId,
      input.eventId,
    );
  }
}