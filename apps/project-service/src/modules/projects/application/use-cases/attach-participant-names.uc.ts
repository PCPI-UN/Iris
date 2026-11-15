import { Inject, Injectable } from '@nestjs/common';
import { ProjectInScope } from '../../domain/entities/project.entity';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';

/**
 * Adds the name and email of the account of each confirmed participant, with one call to
 * auth-service for every project. A participant whose account no longer exists keeps
 * only the student code.
 */
@Injectable()
export class AttachParticipantNamesUC {
  constructor(@Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort) {}

  async execute(projects: ProjectInScope[]): Promise<ProjectInScope[]> {
    const userIds = [...new Set(projects.flatMap((p) => p.participants.map((part) => part.userId)))];
    if (!userIds.length) return projects;

    const users = await this.auth.findUsersByIds(userIds);
    const userById = new Map(users.map((user) => [user.id, user]));
    return projects.map((project) => ({
      ...project,
      participants: project.participants.map((participant) => {
        const user = userById.get(participant.userId);
        return user
          ? { ...participant, firstName: user.firstName, lastName: user.lastName ?? null, email: user.email }
          : participant;
      }),
    }));
  }
}
