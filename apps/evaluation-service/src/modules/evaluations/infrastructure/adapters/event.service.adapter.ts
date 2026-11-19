import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
    EVENT_SERVICE_NAME,
    EventServiceClient,
    EventProto,
} from '@app/common/generated/event';
import { EventServicePort } from '../ports/event.service.port';
import { ProjectServicePort } from '../ports/project.service.port';

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

    async getEvent(id: number): Promise<EventProto> {
        const response = await lastValueFrom(
            this.eventService.getEvent({ id })
        );
        if (!response.event) {
            throw new Error('No se encontró el evento');
        }
        return response.event;
    }
}
