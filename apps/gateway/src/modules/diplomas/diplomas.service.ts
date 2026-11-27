import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventProto } from '@app/common/generated/event';
import { EventService } from '../events/events.service';
import { ProjectsService } from '../projects/projects.service';
import { fileNamePart } from '../../common/excel/xlsx-file';
import { DiplomaTemplate, parseDiplomaTemplates } from './diploma-templates';
import { DiplomaPdfRenderer } from './diploma.pdf';

export interface DiplomaFile {
  buffer: Buffer;
  fileName: string;
}

/**
 * Award diplomas (CU-86e3wzr68), generated on demand and never stored.
 *
 * - A student gets the diploma of their own project in the event (project-service answers
 *   404 when they have none): the user comes from the session. The academic profiles
 *   DIRECTOR and DEAN get the one of any project of their scope (AcademicService), and
 *   the staff with `manage:events` the one of any project of the event.
 * - Only once the admin publishes the event results, and only when the project won at
 *   least one award of the event. Co-winners each get their own diploma.
 * - One diploma per project: the design carries the event title, signature and date, and
 *   only the project name is printed on it, so a project with two awards gets the same one.
 * - The design of each event comes from `DIPLOMA_TEMPLATES` (`eventId:template` pairs);
 *   an event without a design has no diploma.
 */
@Injectable()
export class DiplomasService {
  private readonly logger = new Logger(DiplomasService.name);
  private readonly templates: Map<number, DiplomaTemplate>;

  constructor(
    private readonly eventsService: EventService,
    private readonly projectsService: ProjectsService,
    private readonly renderer: DiplomaPdfRenderer,
    config: ConfigService,
  ) {
    const { templates, invalid } = parseDiplomaTemplates(
      config.get<string>('DIPLOMA_TEMPLATES'),
    );
    if (invalid.length) {
      this.logger.warn(
        `DIPLOMA_TEMPLATES entries ignored (expected eventId:template): ${invalid.join(', ')}`,
      );
    }
    this.templates = templates;
  }

  /**
   * Whether the event has a diploma design in `DIPLOMA_TEMPLATES`. The student dashboard
   * uses it to flag the events whose diploma can be downloaded (CU-1dfnv12dk1b).
   */
  hasDiploma(eventId: number): boolean {
    return this.templates.has(eventId);
  }

  async getMyDiploma(userId: number, eventId: number): Promise<DiplomaFile> {
    const [{ project }, event] = await Promise.all([
      // NOT_FOUND (404) when the user has no project in the event
      this.projectsService.getMyProjectByEvent(userId, eventId),
      this.eventsService.getEventById(eventId),
    ]);
    return this.diplomaOf(
      project!,
      eventId,
      event,
      'Tu proyecto no tiene premios en este evento, así que no tiene diploma',
    );
  }

  /**
   * Diploma of a project the caller may already read; the academic endpoint checks the
   * scope of the profile before calling it.
   */
  async getProjectDiploma(project: {
    id: number;
    name: string;
    eventId: number;
  }): Promise<DiplomaFile> {
    const event = await this.eventsService.getEventById(project.eventId);
    return this.diplomaOf(
      project,
      project.eventId,
      event,
      'El proyecto no tiene premios en este evento, así que no tiene diploma',
    );
  }

  /**
   * Diploma of any project of the event, for the staff that manages the event and its
   * awards (`manage:events`). Same rules as the student one; a project of another event
   * answers 404 like a missing one.
   */
  async getEventProjectDiploma(
    eventId: number,
    projectId: number,
  ): Promise<DiplomaFile> {
    // NOT_FOUND (404) when the project does not exist
    const project = await this.projectsService.getProjectById(projectId);
    if (project.eventId !== eventId) {
      throw new NotFoundException(
        `El proyecto ${projectId} no pertenece al evento ${eventId}`,
      );
    }
    return this.getProjectDiploma(project);
  }

  /**
   * The diplomas of every winner of the event in one PDF, one page per project ordered by
   * category and award position, for the staff with `manage:events`. Same rules as the
   * single one: published results, a published award of the event and a design.
   */
  async getEventDiplomas(eventId: number): Promise<DiplomaFile> {
    const event = await this.eventsService.getEventById(eventId);
    if (!event) {
      throw new NotFoundException(`No se encontró el evento con ID ${eventId}`);
    }
    if (!event.resultsPublished) {
      throw new ForbiddenException(
        'Los resultados del evento aún no se han publicado',
      );
    }
    const template = this.templates.get(eventId);
    if (!template) {
      throw new NotFoundException(
        'Este evento no tiene un diploma configurado',
      );
    }

    const winnerIds = await this.winnerProjectIds(eventId);
    const { awards = [] } = winnerIds.length
      ? await this.eventsService.listAwardsByProjects(winnerIds)
      : { awards: [] };
    const awarded = new Set(
      awards
        .filter((a) => a.eventId === eventId && a.resultsPublished)
        .map((a) => a.projectId),
    );
    const projectIds = winnerIds.filter((id) => awarded.has(id));
    if (!projectIds.length) {
      throw new NotFoundException(
        'El evento no tiene proyectos ganadores, así que no tiene diplomas',
      );
    }

    const names = await this.projectsService.getProjectNamesByIds(projectIds);
    const buffer = await this.renderer.renderMany(
      projectIds.map((id) => ({
        template,
        projectName: names.get(id) ?? `Proyecto ${id}`,
      })),
      `Diplomas - ${event.name}`,
    );
    return {
      buffer,
      fileName: `diplomas_${fileNamePart(event.name)}.pdf`,
    };
  }

  /** Projects that won an award of the event, once each, by category and award position */
  private async winnerProjectIds(eventId: number): Promise<number[]> {
    const categories = await allPages((page) =>
      this.eventsService
        .listCategoriesByEvent(eventId, { page, limit: PAGE_SIZE })
        .then((r) => ({ items: r.categories ?? [], meta: r.meta })),
    );
    const ids: number[] = [];
    for (const category of categories) {
      const awards = await allPages((page) =>
        this.eventsService
          .listCategoryAwards({
            categoryId: category.id,
            page,
            limit: PAGE_SIZE,
          })
          .then((r) => ({ items: r.awards ?? [], meta: r.meta })),
      );
      awards.sort((a, b) => a.position - b.position);
      for (const award of awards) {
        const winners = await allPages((page) =>
          this.eventsService
            .listAwardWinners({ awardId: award.id, page, limit: PAGE_SIZE })
            .then((r) => ({ items: r.winners ?? [], meta: r.meta })),
        );
        ids.push(...winners.map((w) => w.projectId));
      }
    }
    return [...new Set(ids)];
  }

  /**
   * Whether getProjectDiploma gives this project its diploma, without rendering it: a
   * design for the event, published results and a published award of the event.
   */
  async isAvailable(project: {
    id: number;
    eventId: number;
  }): Promise<boolean> {
    if (!this.hasDiploma(project.eventId)) return false;
    const [event, { awards = [] }] = await Promise.all([
      this.eventsService.getEventById(project.eventId),
      this.eventsService.listAwardsByProjects([project.id]),
    ]);
    return (
      !!event?.resultsPublished &&
      awards.some((a) => a.eventId === project.eventId && a.resultsPublished)
    );
  }

  /** Published results, a published award of the event and a design, then the PDF */
  private async diplomaOf(
    project: { id: number; name: string },
    eventId: number,
    event: EventProto | undefined,
    noAwardMessage: string,
  ): Promise<DiplomaFile> {
    if (!event) {
      throw new NotFoundException(`No se encontró el evento con ID ${eventId}`);
    }
    if (!event.resultsPublished) {
      throw new ForbiddenException(
        'Los resultados del evento aún no se han publicado',
      );
    }

    const { awards = [] } = await this.eventsService.listAwardsByProjects([
      project.id,
    ]);
    const won = awards.some((a) => a.eventId === eventId && a.resultsPublished);
    if (!won) {
      throw new NotFoundException(noAwardMessage);
    }

    const template = this.templates.get(eventId);
    if (!template) {
      throw new NotFoundException(
        'Este evento no tiene un diploma configurado',
      );
    }

    const buffer = await this.renderer.render({
      template,
      projectName: project.name,
    });
    return {
      buffer,
      fileName: `diploma_${fileNamePart(project.name)}.pdf`,
    };
  }
}

const PAGE_SIZE = 100;

/** Every item of a paginated list of event-service */
async function allPages<T>(
  fetchPage: (
    page: number,
  ) => Promise<{ items: T[]; meta?: { totalPages?: number } }>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const { items: pageItems, meta } = await fetchPage(page);
    items.push(...pageItems);
    if (!pageItems.length || page >= (meta?.totalPages ?? 1)) return items;
  }
}
