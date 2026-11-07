import { Inject, Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import {
  EVENT_SERVICE_PORT,
  EventServicePort,
} from '../ports/event-service.port';
import { getJurorImportEvent } from './juror-import-event';

export interface JurorImportTemplateProject {
  projectId: number;
  department: string;
  projectCode: string;
  name: string;
}

export interface JurorImportTemplate {
  eventName: string;
  departments: string[];
  projects: JurorImportTemplateProject[];
}

const byText = (a: string, b: string) =>
  a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Numbers in numeric order ("2" before "10"); projects without number go last */
const byCode = (a: string, b: string) => {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
};

/**
 * Data for the downloadable juror template of an event: its departments and the
 * approved projects that can receive jurors, including those without a number yet.
 */
@Injectable()
export class GetJurorImportTemplateUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    @Inject(EVENT_SERVICE_PORT) private readonly events: EventServicePort,
  ) {}

  async execute(input: { eventId: number }): Promise<JurorImportTemplate> {
    const { eventId } = input;
    const event = await getJurorImportEvent(this.events, eventId);
    const [categories, projects] = await Promise.all([
      this.events.listCategoriesByEvent(eventId),
      this.repo.listWithJurorsByEvent(eventId),
    ]);

    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const templateProjects = projects
      .filter((project) => project.state === 'APPROVED')
      .map((project) => ({
        projectId: project.id,
        department: categoryName.get(project.courseId) ?? '',
        projectCode: project.projectCode?.trim() ?? '',
        name: project.name,
      }))
      .sort(
        (a, b) =>
          byText(a.department, b.department) ||
          byCode(a.projectCode, b.projectCode) ||
          byText(a.name, b.name),
      );

    return {
      eventName: event.name ?? '',
      departments: categories.map((c) => c.name).sort(byText),
      projects: templateProjects,
    };
  }
}
