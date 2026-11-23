import { EventMember } from '../entities/event-member.entity';

export abstract class EventMemberRepository {
  abstract create(input: {
    userId: number;
    eventId: number;
    roleId: number;
    active?: boolean; // opcional porque en schema tiene default = true
    createdAt: Date;
    updatedAt: Date;
  }): Promise<EventMember>;

  abstract softDelete(userId: number, eventId: number): Promise<void>;

  abstract findByUserAndEvent(
    userId: number,
    eventId: number,
  ): Promise<EventMember | null>;

  abstract findActiveByUserAndEvent(
    userId: number,
    eventId: number,
  ): Promise<EventMember | null>;

  abstract findByEventId(
    eventId: number,
    roleId?: number,
    page?: number,
    limit?: number,
    activeOnly?: boolean,
  ): Promise<[EventMember[], number]>; // [data, total]

  /** Events where the user has an active membership with the given role. */
  abstract findActiveEventIdsByUserAndRole(
    userId: number,
    roleId: number,
  ): Promise<number[]>;
}
