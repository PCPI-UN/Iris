import {
  CreateEventResponse,
  UpdateEventResponse,
  GetEventResponse,
  DeleteEventResponse,
  ListMyEventsResponse,
  ListEventsResponse,
  ListEventsByIdsResponse,
  EventProto,
  EventWithRole,
  PaginationMetadata,
  EventStatus as PbEventStatus,
  EvaluationType,
  EventType,
} from '@app/common/generated/event';
import { Event } from '@events/domain/entities/event.entity';
import { getEventStatus } from '@events/domain/events/get-event-status.util';

export class EventMapper {
  private static toEventProto(e: Event): EventProto {
    const status = getEventStatus(
      e.startDate,
      e.endDate,
      e.inscriptionDeadline,
    );

    return {
      id: e.id,
      name: e.name ?? '',
      description: e.description ?? '',
      accessCode: e.accessCode ?? '',
      isPubliclyJoinable: e.isPubliclyJoinable ?? false,
      inscriptionDeadline: e.inscriptionDeadline
        ? e.inscriptionDeadline.toISOString()
        : '',
      evaluationsOpened: e.evaluationsOpened ?? false,
      startDate: e.startDate ? e.startDate.toISOString() : '',
      endDate: e.endDate ? e.endDate.toISOString() : '',
      active: e.active ?? true,
      createdAt: e.createdAt ? e.createdAt.toISOString() : '',
      updatedAt: e.updatedAt ? e.updatedAt.toISOString() : '',
      location: e.location ?? '',
      status: status as PbEventStatus,
      inscriptionCost: e.inscriptionCost ?? 0,
      locationDetails: e.locationDetails ?? '',
      latitude: e.latitude ?? 0,
      longitude: e.longitude ?? 0,
      eventType: e.eventType ?? EventType.EVENT_TYPE_UNSPECIFIED,
      collaborators: e.collaborators ?? [],
      organizers: e.organizers ?? [],
      createdByUserId: e.createdByUserId ?? 0,
      evaluationType: e.evaluationType ?? EvaluationType.EVALUATION_TYPE_UNSPECIFIED,
      inscriptionRequirements: e.inscriptionRequirements ?? '',
      minimumTeamSize: e.minimumTeamSize ?? 0,
      aboutOurAllies: e.aboutOurAllies ?? '',
    };
  }

  private static computeStatus(event: Event): PbEventStatus {
    const status = getEventStatus(
      event.startDate,
      event.endDate,
      event.inscriptionDeadline,
    );
    return status as PbEventStatus;
  }

  static toCreateEventResponse(event: Event): CreateEventResponse {
    return {
      event: this.toEventProto(event),
    };
  }

  static toUpdateEventResponse(event: Event): UpdateEventResponse {
    return {
      event: this.toEventProto(event),
    };
  }

  static toGetEventResponse(event: Event): GetEventResponse {
    return {
      event: this.toEventProto(event),
    };
  }

  static toListEventsByIdsResponse(events: Event[]): ListEventsByIdsResponse {
    return {
      events: events.map((event) => this.toEventProto(event)),
    };
  }

  static toDeleteEventResponse(): DeleteEventResponse {
    return {
      ok: true,
    };
  }

  static toListMyEventsResponse(result: {
    events: Array<Event & { userEventRoleId?: number }>;
    total: number;
    page: number;
    limit: number;
  }): ListMyEventsResponse {
    const { events, total, page, limit } = result;

    // Map events to EventWithRole (only roleId, no enrichment)
    const eventProtos: EventWithRole[] = events.map((event) => ({
      id: event.id,
      name: event.name,
      description: event.description || '',
      accessCode: event.accessCode,
      isPubliclyJoinable: event.isPubliclyJoinable,
      inscriptionDeadline: event.inscriptionDeadline
        ? new Date(event.inscriptionDeadline).toISOString()
        : '',
      evaluationsOpened: event.evaluationsOpened,
      startDate: event.startDate
        ? new Date(event.startDate).toISOString()
        : '',
      endDate: event.endDate ? new Date(event.endDate).toISOString() : '',
      active: event.active,
      createdAt: event.createdAt
        ? new Date(event.createdAt).toISOString()
        : '',
      updatedAt: event.updatedAt
        ? new Date(event.updatedAt).toISOString()
        : '',
      location: event.location || '',
      status: this.computeStatus(event),
      roleId: event.userEventRoleId || 0, // Only roleId - gateway enriches
      inscriptionCost: event.inscriptionCost ?? 0,
      locationDetails: event.locationDetails || '',
      eventType: event.eventType ?? EventType.EVENT_TYPE_UNSPECIFIED,
      collaborators: event.collaborators ?? [],
      organizers: event.organizers ?? [],
      createdByUserId: event.createdByUserId ?? 0,
      evaluationType: event.evaluationType ?? EvaluationType.EVALUATION_TYPE_UNSPECIFIED,
      inscriptionRequirements: event.inscriptionRequirements ?? '',
      minimumTeamSize: event.minimumTeamSize ?? 0,
      aboutOurAllies: event.aboutOurAllies ?? '',
    }));

    // Create pagination metadata
    const meta: PaginationMetadata = {
      total,
      itemsOnCurrentPage: events.length,
      itemsPerPage: limit,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };

    return {
      events: eventProtos,
      meta,
    };
  }

  static toListEventsResponse(result: {
    items: Event[];
    total: number;
    page: number;
    limit: number;
  }): ListEventsResponse {
    const { items, total, page, limit } = result;

    // Map events to EventProto
    const eventProtos: EventProto[] = items.map((event) =>
      this.toEventProto(event),
    );

    // Create pagination metadata
    const meta: PaginationMetadata = {
      total,
      itemsOnCurrentPage: items.length,
      itemsPerPage: limit,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };

    return {
      events: eventProtos,
      meta,
    };
  }

  static toGetEventsForARResponse(events: any[]): { events: any[] } {
    return {
      events: events.map((e) => ({
        id:          e.id,
        name:        e.name,
        description: e.description ?? '',
        startDate:   e.startDate instanceof Date ? e.startDate.toISOString() : e.startDate,
        endDate:     e.endDate   instanceof Date ? e.endDate.toISOString()   : e.endDate,
        location:    e.location  ?? '',
        latitude:    e.latitude  ?? 0,
        longitude:   e.longitude ?? 0,
      })),
    };
  }
}
