import { Injectable } from '@nestjs/common';
import { EventRepository } from '../../domain/repositories/event.repository';
import { EventMemberRepository } from '../../domain/repositories/event-member.repository';
import { ProjectClientPort } from '../../infrastructure/ports/project-client.port';
import { ListMyEventsWithRolesDto } from '../dto/list-my-events-with-roles.dto';
import { Event as DomainEvent } from '../../domain/entities/event.entity';

const JUROR_ROLE_ID = 4;
const ROLE_ORDER = ['JURY', 'PARTICIPANT', 'TUTOR', 'PROFESSOR', 'DIRECTOR'];

export interface EventWithRolesOutput {
  event: DomainEvent;
  roles: string[];
}

interface ListMyEventsWithRolesOutput {
  items: EventWithRolesOutput[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Events of the user with every role they hold in each one. JURY comes from the
 * event membership; the rest comes from project-service, which knows the projects.
 * Platform staff does not get every event here: only the ones where they hold a role.
 */
@Injectable()
export class ListMyEventsWithRolesUseCase {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly eventMemberRepository: EventMemberRepository,
    private readonly projectClient: ProjectClientPort,
  ) {}

  async execute(
    dto: ListMyEventsWithRolesDto,
  ): Promise<ListMyEventsWithRolesOutput> {
    const { userId, status, page = 1, limit = 10 } = dto;
    const enforcedLimit = Math.min(limit, 50);

    const [jurorEventIds, projectRoles] = await Promise.all([
      this.eventMemberRepository.findActiveEventIdsByUserAndRole(
        userId,
        JUROR_ROLE_ID,
      ),
      this.projectClient.listMyEventRoles(userId),
    ]);

    const rolesByEvent = new Map<number, Set<string>>();
    const addRole = (eventId: number, role: string) => {
      const roles = rolesByEvent.get(eventId) ?? new Set<string>();
      roles.add(role);
      rolesByEvent.set(eventId, roles);
    };
    jurorEventIds.forEach((eventId) => addRole(eventId, 'JURY'));
    projectRoles.forEach(({ eventId, roles }) =>
      roles.forEach((role) => addRole(eventId, role)),
    );

    if (!rolesByEvent.size) {
      return { items: [], total: 0, page, limit: enforcedLimit };
    }

    const { events, total } = await this.eventRepository.findByIdsAndPeriod({
      ids: [...rolesByEvent.keys()],
      period: status,
      now: new Date(),
      page,
      limit: enforcedLimit,
    });

    return {
      items: events.map((event) => ({
        event,
        roles: [...(rolesByEvent.get(event.id) ?? [])].sort(
          (a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b),
        ),
      })),
      total,
      page,
      limit: enforcedLimit,
    };
  }
}
