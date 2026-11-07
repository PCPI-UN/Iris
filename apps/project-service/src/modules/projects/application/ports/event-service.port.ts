export const EVENT_SERVICE_PORT = 'EVENT_SERVICE_PORT';

export interface JurorMembership {
  memberUserId: number;
  memberEventId: number;
  memberRoleId: number;
}

export interface EventMembership {
  userId: number;
  eventId: number;
  roleId: number;
}

export interface EventCategory {
  id: number;
  name: string;
  active: boolean;
}

export interface EventServicePort {
  getEventById(id: number): Promise<any>;
  getCourseById(id: number): Promise<any>;

  /** Active membership of the user in the event, or null if there is none. */
  getEventMember(
    userId: number,
    eventId: number,
  ): Promise<EventMembership | null>;

  /** Every category (department) of the event, active or not. */
  listCategoriesByEvent(eventId: number): Promise<EventCategory[]>;
  
  /**
   * Checks if a user is a juror (has a juror role) in the given event.
   * Returns the full JurorKey if they are a juror, null otherwise.
   * The event-service knows which roles are juror roles.
   */
  getJurorMembership(userId: number, eventId: number): Promise<JurorMembership | null>;
}
