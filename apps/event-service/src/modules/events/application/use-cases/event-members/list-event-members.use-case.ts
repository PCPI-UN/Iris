import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { EventMemberRepository } from '../../../domain/repositories/event-member.repository';
import { EventRepository } from '../../../domain/repositories/event.repository';
import { EventMember } from '../../../domain/entities/event-member.entity';
import { ListEventMembersDTO } from '../../dto/event-members/list-event-members.dto';

@Injectable()
export class ListEventMembersUseCase {
  constructor(
    private readonly eventMemberRepository: EventMemberRepository,
    private readonly eventRepository: EventRepository,
  ) {}

  async execute(input: ListEventMembersDTO): Promise<{
    members: EventMember[];
    total: number;
    page: number;
    limit: number;
  }> {
    const event = await this.eventRepository.findById(input.eventId);
    if (!event) {
      throw new RpcException({
        code: 5,
        message: `No se encontró el evento con ID ${input.eventId}`,
      });
    }

    const page = input.page || 1;
    const limit = input.limit || 20;

    // Get active members with optional role filter and pagination
    const [members, total] = await this.eventMemberRepository.findByEventId(
      input.eventId,
      input.roleId,
      page,
      limit,
      true,
    );

    return {
      members,
      total,
      page,
      limit,
    };
  }
}
