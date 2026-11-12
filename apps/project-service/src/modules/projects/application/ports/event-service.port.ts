import { ParticipationAward, ParticipationEvent } from '../../domain/student-participation-stats';

export const EVENT_SERVICE_PORT = 'EVENT_SERVICE_PORT';

export interface JurorMembership {
  memberUserId: number;
  memberEventId: number;
  memberRoleId: number;
}

export interface EventServicePort {
  getEventById(id: number): Promise<any>;
  getCourseById(id: number): Promise<any>;
  
  /**
   * Checks if a user is a juror (has a juror role) in the given event.
   * Returns the full JurorKey if they are a juror, null otherwise.
   * The event-service knows which roles are juror roles.
   */
  getJurorMembership(userId: number, eventId: number): Promise<JurorMembership | null>;

  /** Events with the given ids, deleted ones included (active = false). */
  listEventsByIds(ids: number[]): Promise<ParticipationEvent[]>;

  /** Awards won by the given projects in active categories. */
  listAwardsByProjects(projectIds: number[]): Promise<ParticipationAward[]>;

  /** Names of the given categories (courses), in one call. */
  listCategoriesByIds(ids: number[]): Promise<{ id: number; name: string }[]>;
}
