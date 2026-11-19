import {
  CreateEventMemberResponse,
  DeleteEventMemberResponse,
  GetEventMemberResponse,
  ListEventMembersResponse,
  EventMemberProto,
  PaginationMetadata,
} from '@app/common/generated/event';
import { EventMember } from '@events/domain/entities/event-member.entity';

export class EventMemberMapper {
  private static toEventMemberProto(em: EventMember): EventMemberProto {
    return {
      userId: em.userId,
      eventId: em.eventId,
      roleId: em.roleId,
      active: em.active,
      createdAt: em.createdAt.toISOString(),
      updatedAt: em.updatedAt.toISOString(),
    };
  }

  static toCreateEventMemberResponse(): CreateEventMemberResponse {
    return {
      ok: true,
      message: 'Miembro del evento creado correctamente',
    };
  }

  static toDeleteEventMemberResponse(): DeleteEventMemberResponse {
    return {
      ok: true,
    };
  }

  static toGetEventMemberResponse(
    member: EventMember | null,
  ): GetEventMemberResponse {
    if (!member) {
      return {
        userId: 0,
        eventId: 0,
        roleId: 0,
        active: false,
        createdAt: '',
        updatedAt: '',
      };
    }

    return this.toEventMemberProto(member);
  }

  static toListEventMembersResponse(result: {
    members: EventMember[];
    total: number;
    page: number;
    limit: number;
  }): ListEventMembersResponse {
    const meta: PaginationMetadata = {
      total: result.total,
      itemsOnCurrentPage: result.members.length,
      currentPage: result.page,
      itemsPerPage: result.limit,
      totalPages: Math.ceil(result.total / result.limit) || 1,
    };

    return {
      members: result.members.map((member) => this.toEventMemberProto(member)),
      meta,
    };
  }
}
