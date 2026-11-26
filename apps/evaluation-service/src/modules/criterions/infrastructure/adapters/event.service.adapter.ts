import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
    EVENT_SERVICE_NAME,
    EventServiceClient,
    EventProto,
} from '@app/common/generated/event';
import { EventServicePort } from '../ports/event.service.port';

@Injectable()
export class EventServiceAdapter implements EventServicePort, OnModuleInit {
    private eventService: EventServiceClient;

    constructor(
        @Inject(EVENT_SERVICE_NAME) private client: ClientGrpc,
    ) { }

    onModuleInit() {
        this.eventService =
            this.client.getService<EventServiceClient>(EVENT_SERVICE_NAME);
    }

    async getEvent(eventId: number): Promise<EventProto> {
        const response = await lastValueFrom(
            this.eventService.getEvent({ id: eventId })
        );

        if (!response.event) {
            throw new Error('No se encontró el evento');
        }

        return response.event;
    }

    async listCourseIdsByEvent(eventId: number): Promise<number[]> {
        const courseIds: number[] = [];
        let page = 1;
        let totalPages = 1;

        do {
            const response = await lastValueFrom(
                this.eventService.listCoursesByEvent({
                    eventId,
                    onlyActive: true,
                    page,
                    limit: 100,
                    q: '',
                })
            );
            courseIds.push(...response.courses.map((c) => c.id));
            totalPages = response.meta?.totalPages ?? 1;
            page++;
        } while (page <= totalPages);

        return courseIds;
    }

    async validateCoursesBelongToEvent(
        courseIds: number[],
        eventId: number,
    ): Promise<{ valid: boolean; invalidCourses: number[] }> {
        const eventCourseIds = new Set(await this.listCourseIdsByEvent(eventId));
        const invalidCourses = courseIds.filter((id) => !eventCourseIds.has(id));

        return {
            valid: invalidCourses.length === 0,
            invalidCourses,
        };
    }
}
