import { Event as DomainEvent } from '../entities/event.entity';
import { EventStatus } from '@app/common/generated/event';

export abstract class EventRepository {
  abstract create(input: any): Promise<DomainEvent>;
  abstract findById(id: number): Promise<DomainEvent | null>;
  /** Events with the given ids, soft deleted ones included (active = false). */
  abstract findByIds(ids: number[]): Promise<DomainEvent[]>;
  abstract findByAccessCode(accessCode: string): Promise<DomainEvent | null>;
  abstract findAll(): Promise<DomainEvent[]>;
  abstract update(id: number, input: any): Promise<DomainEvent>;
  abstract delete(id: number): Promise<void>; // Soft delete - sets active = false
  abstract countActive(): Promise<number>;

  abstract findPaginated(params: {
    page: number;
    limit: number;
    q?: string;
    onlyActive?: boolean;
    statuses?: EventStatus[];
  }): Promise<{ items: DomainEvent[]; total: number }>;


  abstract findPaginatedByMember(params: {
    page: number;
    limit: number;
    q?: string;
    onlyActive?: boolean;
    userId: number;
  }): Promise<{ items: DomainEvent[]; total: number }>;

  abstract findMyEvents(params: {
    userId: number;
    page: number;
    limit: number;
    isPlatformStaff: boolean;
  }): Promise<{
    events: Array<DomainEvent & { userEventRoleId?: number }>;
    total: number;
  }>;

  abstract findActiveWithCoordinates(): Promise<DomainEvent[]>;
}
