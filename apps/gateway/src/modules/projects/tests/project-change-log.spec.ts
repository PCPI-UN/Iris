import { of, throwError } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { ProjectsService } from '../projects.service';
import { ProjectsController } from '../projects.controller';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';

describe('GET /projects/:id/change-log', () => {
  const buildService = (entries: unknown[]) => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    const grpc = { listProjectChangeLog: jest.fn(() => of({ entries })) };
    const fetchUserProfiles = {
      execute: jest.fn().mockResolvedValue(
        new Map([
          [
            7,
            {
              id: '7',
              firstName: 'Laura',
              lastName: 'Gómez',
              email: 'l@uni.edu',
            },
          ],
          // Placeholder returned when auth-service fails or cannot find the user
          [8, { id: 'user-8', firstName: '', lastName: '', email: '' }],
        ]),
      ),
    };
    const logger = { warn: jest.fn() };
    Object.assign(service, {
      projectsService: grpc,
      fetchUserProfilesUseCase: fetchUserProfiles,
      logger,
    });
    return { service, grpc, fetchUserProfiles, logger };
  };

  it('requires manage:projects', () => {
    const handler = Object.getOwnPropertyDescriptor(
      ProjectsController.prototype,
      'listProjectChangeLog',
    )?.value as object;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'manage:projects',
    ]);
  });

  it('returns each entry with action, author id and name, date, before, after and reason, in the order received', async () => {
    const { service, grpc, fetchUserProfiles } = buildService([
      {
        id: 2,
        projectId: 4,
        actorUserId: 7,
        action: 'STATE',
        beforeJson: '{"state":"APPROVED"}',
        afterJson: '{"state":"REJECTED"}',
        reason: 'Aprobado por error',
        createdAt: '2026-11-20T10:00:00.000Z',
      },
      {
        id: 1,
        projectId: 4,
        actorUserId: 8,
        action: 'INFO',
        beforeJson: '{"name":"A"}',
        afterJson: '{"name":"B"}',
        createdAt: '2026-11-19T10:00:00.000Z',
      },
    ]);

    const result = await service.listProjectChangeLog(4);

    expect(grpc.listProjectChangeLog).toHaveBeenCalledWith({ projectId: 4 });
    expect(fetchUserProfiles.execute).toHaveBeenCalledWith(new Set([7, 8]));
    expect(result.entries).toEqual([
      {
        id: 2,
        action: 'STATE',
        actor: { id: 7, name: 'Laura Gómez' },
        createdAt: '2026-11-20T10:00:00.000Z',
        before: { state: 'APPROVED' },
        after: { state: 'REJECTED' },
        reason: 'Aprobado por error',
      },
      {
        id: 1,
        action: 'INFO',
        actor: { id: 8, name: null },
        createdAt: '2026-11-19T10:00:00.000Z',
        before: { name: 'A' },
        after: { name: 'B' },
        reason: null,
      },
    ]);
  });

  it('logs the entry id and returns empty before/after when the JSON is invalid', async () => {
    const { service, logger } = buildService([
      {
        id: 5,
        projectId: 4,
        actorUserId: 7,
        action: 'INFO',
        beforeJson: '{not json',
        afterJson: '["not an object"]',
        createdAt: '2026-11-20T10:00:00.000Z',
      },
    ]);

    const result = await service.listProjectChangeLog(4);

    expect(result.entries[0]).toMatchObject({ id: 5, before: {}, after: {} });
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Change log entry 5 of project 4'),
    );
  });

  it('returns an empty list for a project without changes', async () => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    Object.assign(service, {
      projectsService: { listProjectChangeLog: jest.fn(() => of({})) },
      fetchUserProfilesUseCase: {
        execute: jest.fn().mockResolvedValue(new Map()),
      },
    });

    await expect(service.listProjectChangeLog(4)).resolves.toEqual({
      entries: [],
    });
  });

  it('lets the NOT_FOUND of project-service through, for the gateway filter to answer 404', async () => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    const error = {
      code: status.NOT_FOUND,
      details: 'No se encontró el proyecto',
    };
    Object.assign(service, {
      projectsService: {
        listProjectChangeLog: jest.fn(() => throwError(() => error)),
      },
      fetchUserProfilesUseCase: { execute: jest.fn() },
    });

    await expect(service.listProjectChangeLog(99)).rejects.toBe(error);
  });
});
