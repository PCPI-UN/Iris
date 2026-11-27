import { Inject, Injectable } from '@nestjs/common';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import {
  eventRequiresCourse,
  getProjectImportEvent,
} from './project-import-event';

export interface ProjectImportTemplate {
  eventName: string;
  /** Active categories of the event, by name: the ones a row may name */
  categoryNames: string[];
  /** The NRC column is required */
  requiresCourse: boolean;
}

/** Data for the downloadable project template of an event */
@Injectable()
export class GetProjectImportTemplateUC {
  constructor(
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
  ) {}

  async execute(input: { eventId: number }): Promise<ProjectImportTemplate> {
    const event = await getProjectImportEvent(this.events, input.eventId);
    const categories = await this.events.listCategoriesByEvent(input.eventId);
    return {
      eventName: event.name ?? '',
      categoryNames: categories
        .filter((category) => category.active !== false)
        .map((category) => category.name)
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      requiresCourse: eventRequiresCourse(event),
    };
  }
}
