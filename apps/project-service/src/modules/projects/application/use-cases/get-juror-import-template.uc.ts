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
  /** Tutor full names: linked ones first, then those still pending */
  tutors: string[];
  /** Emails of those same tutors, in the same order */
  tutorEmails: string[];
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
    const approvedIds = approved.map((p) => p.id);
    const members = await this.loadMembers(approvedIds);
    const tutors = await this.loadTutors(approvedIds);

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const templateProjects = approved
      .map((project) => ({
        projectId: project.id,
        department: categoryName.get(project.courseId) ?? '',
        projectCode: project.projectCode?.trim() ?? '',
        name: project.name,
        members: members.get(project.id) ?? [],
        tutors: (tutors.get(project.id) ?? []).map((t) => t.name),
        tutorEmails: (tutors.get(project.id) ?? []).map((t) => t.email),
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

  /** Tutors by project, linked ones first (name and email from auth-service) and then pending ones */
  private async loadTutors(projectIds: number[]) {
    const byProject = new Map<number, { name: string; email: string }[]>();
    if (!projectIds.length) return byProject;
    const [links, pendings] = await Promise.all([
      this.repo.listTutorLinksByProjects(projectIds),
      this.repo.listPendingTutorsByProjects(projectIds),
    ]);
    const users = await this.auth.findUsersByIds(links.map((l) => l.userId));
    const userById = new Map<number, AuthUser>(users.map((u) => [u.id, u]));
    const add = (projectId: number, name: string, email: string) =>
      byProject.set(projectId, [
        ...(byProject.get(projectId) ?? []),
        { name, email },
      ]);

    for (const link of links) {
      const user = userById.get(link.userId);
      if (user)
        add(
          link.projectId,
          fullName(user.firstName, user.lastName),
          user.email,
        );
    }
    for (const pending of pendings) {
      // A pending tutor already JOINED is linked in project_tutors and listed above
      if (pending.status === 'JOINED') continue;
      add(
        pending.projectId,
        fullName(pending.firstName, pending.lastName),
        pending.email,
      );
    }
    return byProject;
  }
}
