import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import {
  AUTH_SERVICE_PORT,
  AuthServicePort,
  AuthUser,
} from '../ports/auth-service.port';
import { getJurorImportEvent } from './juror-import-event';

export interface JurorImportTemplateProject {
  projectId: number;
  department: string;
  projectCode: string;
  name: string;
  /** Full names: confirmed participants first, then those still pending */
  members: string[];
}

export interface JurorImportTemplate {
  eventName: string;
  projects: JurorImportTemplateProject[];
}

const byText = (a: string, b: string) =>
  a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Numbers in numeric order ("2" before "10"); projects without number go last */
const byCode = (a: string, b: string) => {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
};

const fullName = (firstName: string, lastName?: string | null) =>
  [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

/**
 * Data for the downloadable juror template of an event: the approved projects that can
 * receive jurors, including those without a number yet, with their participants.
 */
@Injectable()
export class GetJurorImportTemplateUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
    @Inject(AUTH_SERVICE_PORT) private readonly auth: AuthServicePort,
  ) {}

  async execute(input: { eventId: number }): Promise<JurorImportTemplate> {
    const { eventId } = input;
    const event = await getJurorImportEvent(this.events, eventId);
    const [categories, projects] = await Promise.all([
      this.events.listCategoriesByEvent(eventId),
      this.repo.listWithJurorsByEvent(eventId),
    ]);

    const approved = projects.filter((project) => project.state === 'APPROVED');
    const members = await this.loadMembers(approved.map((p) => p.id));

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const templateProjects = approved
      .map((project) => ({
        projectId: project.id,
        department: categoryName.get(project.courseId) ?? '',
        projectCode: project.projectCode?.trim() ?? '',
        name: project.name,
        members: members.get(project.id) ?? [],
      }))
      .sort(
        (a, b) =>
          byText(a.department, b.department) ||
          byCode(a.projectCode, b.projectCode) ||
          byText(a.name, b.name),
      );

    return {
      eventName: event.name ?? '',
      projects: templateProjects,
    };
  }

  /** Participant names by project: confirmed ones from auth-service, pending ones as stored locally */
  private async loadMembers(projectIds: number[]) {
    const [confirmed, pending] = await Promise.all([
      Promise.all(projectIds.map((id) => this.repo.listParticipants(id))),
      Promise.all(
        projectIds.map((id) => this.repo.listPendingParticipants(id)),
      ),
    ]);
    const users = await this.auth.findUsersByIds(
      confirmed.flat().map((participant) => participant.userId),
    );
    const userById = new Map<number, AuthUser>(users.map((u) => [u.id, u]));

    const byProject = new Map<number, string[]>();
    projectIds.forEach((projectId, index) => {
      const names = [
        ...confirmed[index].map((participant) => {
          const user = userById.get(participant.userId);
          return user ? fullName(user.firstName, user.lastName) : '';
        }),
        ...pending[index].map((p) => fullName(p.firstName, p.lastName)),
      ].filter(Boolean);
      byProject.set(projectId, names);
    });
    return byProject;
  }
}
