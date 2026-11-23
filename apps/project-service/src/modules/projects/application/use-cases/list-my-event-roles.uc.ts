import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';

export interface EventRolesView {
  eventId: number;
  roles: ('PARTICIPANT' | 'TUTOR')[];
}

@Injectable()
export class ListMyEventRolesUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
  ) {}

  /** Events where the user has a project-derived role, with those roles, whatever the project state. */
  async execute(userId: number): Promise<EventRolesView[]> {
    const [asParticipant, asTutor] = await Promise.all([
      this.repo.listEventIdsAsParticipant(userId),
      this.repo.listEventIdsAsTutor(userId),
    ]);
    const byEvent = new Map<number, EventRolesView['roles']>();
    for (const eventId of asParticipant) byEvent.set(eventId, ['PARTICIPANT']);
    for (const eventId of asTutor)
      byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), 'TUTOR']);
    return [...byEvent].map(([eventId, roles]) => ({ eventId, roles }));
  }
}
