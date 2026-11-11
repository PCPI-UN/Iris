import { Injectable } from '@nestjs/common';
import { EventRepository } from '../../domain/repositories/event.repository';
import { Event } from '../../domain/entities/event.entity';
import { ListEventsByIdsDTO } from '../dto/list-events-by-ids.dto';

/**
 * Events with the given ids, soft deleted ones included (active = false) so the caller
 * decides what to do with them. Unknown ids are skipped. Used by the student dashboard
 * (IRIS-V3-STD-01) to resolve the events of the student's projects in one call.
 */
@Injectable()
export class ListEventsByIdsUC {
  constructor(private readonly repo: EventRepository) {}

  async execute(input: ListEventsByIdsDTO): Promise<Event[]> {
    const ids = [...new Set(input.ids ?? [])];
    if (!ids.length) return [];

    return this.repo.findByIds(ids);
  }
}
