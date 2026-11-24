import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * - Only for the caller's own project in the event (project-service answers 404 when they
 *   have none): the user comes from the session.
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
    if (!event) {
      throw new NotFoundException(`No se encontró el evento con ID ${eventId}`);
    }
    if (!event.resultsPublished) {
      throw new ForbiddenException(
        'Los resultados del evento aún no se han publicado',
      );
    }

    const { awards = [] } = await this.eventsService.listAwardsByProjects([
      project!.id,
    ]);
    const won = awards.some((a) => a.eventId === eventId && a.resultsPublished);
    if (!won) {
      throw new NotFoundException(
        'Tu proyecto no tiene premios en este evento, así que no tiene diploma',
      );
    }

    const template = this.templates.get(eventId);
    if (!template) {
      throw new NotFoundException(
        'Este evento no tiene un diploma configurado',
      );
    }

    const buffer = await this.renderer.render({
      template,
      projectName: project!.name,
    });
    return {
      buffer,
      fileName: `diploma_${fileNamePart(project!.name)}.pdf`,
    };
  }
}
