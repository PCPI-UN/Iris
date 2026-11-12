import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { ProjectTutorView } from '../../domain/entities/project.entity';
import { AUTH_SERVICE_PORT, AuthServicePort } from '../ports/auth-service.port';

@Injectable()
export class ListProjectTutorsUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
  ) {}

  /** Tutors of each project: linked ones with the name from auth-service, then the pending ones. */
  async execute(projectIds: number[]): Promise<Map<number, ProjectTutorView[]>> {
    const byProject = new Map<number, ProjectTutorView[]>(projectIds.map((id) => [id, []]));
    if (!projectIds.length) return byProject;

    const [links, pendings] = await Promise.all([
      this.repo.listTutorLinksByProjects(projectIds),
      this.repo.listPendingTutorsByProjects(projectIds),
    ]);
    const users = await this.auth.findUsersByIds(links.map((link) => link.userId));
    const userById = new Map(users.map((user) => [user.id, user]));

    for (const link of links) {
      const user = userById.get(link.userId);
      // A tutor whose account no longer exists has no name to show
      if (!user) continue;
      byProject.get(link.projectId)?.push({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName ?? null,
        pending: false,
      });
    }
    for (const pending of pendings) {
      // A pending tutor already marked JOINED is linked in project_tutors and listed above
      if (pending.status === 'JOINED') continue;
      byProject.get(pending.projectId)?.push({
        firstName: pending.firstName,
        lastName: pending.lastName ?? null,
        pending: true,
        email: pending.email,
      });
    }
    return byProject;
  }
}
