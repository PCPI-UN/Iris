import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiplomasService } from '../diplomas.service';
import { DiplomaPdfRenderer } from '../diploma.pdf';
import { EventService } from '../../events/events.service';
import { ProjectsService } from '../../projects/projects.service';

/** CU-86e3wzr68: who downloads the award diploma and with which design */
describe('DiplomasService', () => {
  const PDF = Buffer.from('%PDF-1.3');

  const build = (
    overrides: {
      event?: unknown;
      awards?: unknown[];
      templates?: string;
    } = {},
  ) => {
    const projectsService = {
      getMyProjectByEvent: jest.fn(() =>
        Promise.resolve({
          project: { id: 5, eventId: 10, name: 'Riego Inteligente IoT' },
        }),
      ),
    };
    const eventsService = {
      getEventById: jest.fn(() =>
        Promise.resolve(
          'event' in overrides
            ? overrides.event
            : { id: 10, resultsPublished: true },
        ),
      ),
      listAwardsByProjects: jest.fn(() =>
        Promise.resolve({
          awards: overrides.awards ?? [
            {
              projectId: 5,
              eventId: 10,
              title: 'Primer puesto',
              resultsPublished: true,
            },
          ],
        }),
      ),
    };
    const renderer = { render: jest.fn(() => Promise.resolve(PDF)) };
    const config = {
      get: jest.fn(() =>
        'templates' in overrides
          ? overrides.templates
          : '10:feria-proyectos-stem,11:engineering-innovation-expo',
      ),
    };

    const service = new DiplomasService(
      eventsService as unknown as EventService,
      projectsService as unknown as ProjectsService,
      renderer as unknown as DiplomaPdfRenderer,
      config as unknown as ConfigService,
    );
    return { service, projectsService, eventsService, renderer };
  };

  it("renders the event design with the caller's project name", async () => {
    const { service, projectsService, eventsService, renderer } = build();

    const file = await service.getMyDiploma(42, 10);

    expect(projectsService.getMyProjectByEvent).toHaveBeenCalledWith(42, 10);
    expect(eventsService.listAwardsByProjects).toHaveBeenCalledWith([5]);
    expect(renderer.render).toHaveBeenCalledWith({
      template: 'feria-proyectos-stem',
      projectName: 'Riego Inteligente IoT',
    });
    expect(file).toEqual({
      buffer: PDF,
      fileName: 'diploma_riego_inteligente_iot.pdf',
    });
  });

  it('gives one diploma to a project with several awards', async () => {
    const { service, renderer } = build({
      awards: [
        {
          projectId: 5,
          eventId: 10,
          title: 'Primer puesto',
          resultsPublished: true,
        },
        {
          projectId: 5,
          eventId: 10,
          title: 'Mejor innovación',
          resultsPublished: true,
        },
      ],
    });

    await service.getMyDiploma(42, 10);

    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('refuses while the results are not published', async () => {
    const { service, renderer } = build({
      event: { id: 10, resultsPublished: false },
    });

    await expect(service.getMyDiploma(42, 10)).rejects.toThrow(
      new ForbiddenException(
        'Los resultados del evento aún no se han publicado',
      ),
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('answers 404 when the event does not exist', async () => {
    const { service } = build({ event: undefined });

    await expect(service.getMyDiploma(42, 10)).rejects.toThrow(
      new NotFoundException('No se encontró el evento con ID 10'),
    );
  });

  it('passes on the 404 of a user without a project in the event', async () => {
    const { service, projectsService, renderer } = build();
    const notFound = new NotFoundException(
      'No tienes un proyecto en este evento',
    );
    projectsService.getMyProjectByEvent.mockRejectedValueOnce(notFound);

    await expect(service.getMyDiploma(42, 10)).rejects.toBe(notFound);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('refuses a project without awards in the event', async () => {
    const { service, renderer } = build({
      awards: [
        // An award of another event does not count
        {
          projectId: 5,
          eventId: 99,
          title: 'Primer puesto',
          resultsPublished: true,
        },
      ],
    });

    await expect(service.getMyDiploma(42, 10)).rejects.toThrow(
      new NotFoundException(
        'Tu proyecto no tiene premios en este evento, así que no tiene diploma',
      ),
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('refuses when the event has no diploma design', async () => {
    const { service, renderer } = build({
      templates: '11:engineering-innovation-expo',
    });

    await expect(service.getMyDiploma(42, 10)).rejects.toThrow(
      new NotFoundException('Este evento no tiene un diploma configurado'),
    );
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('has no designs when DIPLOMA_TEMPLATES is unset', async () => {
    const { service } = build({ templates: undefined });

    await expect(service.getMyDiploma(42, 10)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('tells whether an event has a diploma design (CU-1dfnv12dk1b)', () => {
    const { service } = build();

    expect(service.hasDiploma(10)).toBe(true);
    expect(service.hasDiploma(11)).toBe(true);
    expect(service.hasDiploma(12)).toBe(false);
    expect(build({ templates: undefined }).service.hasDiploma(10)).toBe(false);
  });

  describe('getProjectDiploma (academic profiles)', () => {
    const PROJECT = { id: 5, eventId: 10, name: 'Riego Inteligente IoT' };

    it('renders the diploma of the given project without looking up the caller', async () => {
      const { service, projectsService, eventsService, renderer } = build();

      const file = await service.getProjectDiploma(PROJECT);

      expect(projectsService.getMyProjectByEvent).not.toHaveBeenCalled();
      expect(eventsService.getEventById).toHaveBeenCalledWith(10);
      expect(renderer.render).toHaveBeenCalledWith({
        template: 'feria-proyectos-stem',
        projectName: 'Riego Inteligente IoT',
      });
      expect(file.fileName).toBe('diploma_riego_inteligente_iot.pdf');
    });

    it('keeps the rules of the student one: published results and an award', async () => {
      await expect(
        build({
          event: { id: 10, resultsPublished: false },
        }).service.getProjectDiploma(PROJECT),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        build({ awards: [] }).service.getProjectDiploma(PROJECT),
      ).rejects.toThrow(
        new NotFoundException(
          'El proyecto no tiene premios en este evento, así que no tiene diploma',
        ),
      );
    });
  });
});
