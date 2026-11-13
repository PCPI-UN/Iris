import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { EVENT_SERVICE_NAME, EventProto, EventServiceClient } from '@app/common/generated/event';

export interface EventsPage {
    events: Array<Pick<EventProto, 'id' | 'evaluationType'>>;
    totalPages: number;
}

/** What the grading scales need from event-service: an event, and every event page by page. */
export abstract class EventDirectoryPort {
    /** The event, or `null` when event-service does not know it. */
    abstract getEvent(eventId: number): Promise<Pick<EventProto, 'id' | 'evaluationType'> | null>;
    /** One page of all the events, active or not. */
    abstract listEvents(page: number, limit: number): Promise<EventsPage>;
}

@Injectable()
export class GrpcEventDirectory implements EventDirectoryPort, OnModuleInit {
    private eventService: EventServiceClient;

    constructor(@Inject(EVENT_SERVICE_NAME) private readonly client: ClientGrpc) {}

    onModuleInit() {
        this.eventService = this.client.getService<EventServiceClient>(EVENT_SERVICE_NAME);
    }

    async getEvent(eventId: number): Promise<Pick<EventProto, 'id' | 'evaluationType'> | null> {
        try {
            const response = await lastValueFrom(this.eventService.getEvent({ id: eventId }));
            return response.event ?? null;
        } catch (error) {
            // 5 = NOT_FOUND
            if ((error as { code?: number })?.code === 5) {
                return null;
            }
            throw error;
        }
    }

    async listEvents(page: number, limit: number): Promise<EventsPage> {
        const response = await lastValueFrom(
            this.eventService.listEvents({ page, limit, onlyActive: false, statuses: [] }),
        );
        return {
            events: response.events ?? [],
            totalPages: response.meta?.totalPages ?? 0,
        };
    }
}
