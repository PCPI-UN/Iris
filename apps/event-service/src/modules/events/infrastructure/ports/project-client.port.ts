import { EventRoles } from '@app/common/generated/project';

export abstract class ProjectClientPort {
  /** Events where the user has a role derived from projects (PARTICIPANT, TUTOR). */
  abstract listMyEventRoles(userId: number): Promise<EventRoles[]>;
}
