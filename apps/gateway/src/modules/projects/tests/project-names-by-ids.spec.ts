import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';
import { MAX_PROJECT_NAME_IDS } from '@app/common/constants/projects';

/** ProjectsService with only what getProjectNamesByIds uses */
const buildService = (missing: number[] = []) => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const grpc = {
    getProjectNamesByIds: jest.fn(({ ids }: { ids: number[] }) =>
      of({
        projects: ids
          .filter((id) => !missing.includes(id))
          .map((id) => ({ id, name: `Proyecto ${id}` })),
      }),
    ),
  };
  const logger = { warn: jest.fn() };
  Object.assign(service, { projectsService: grpc, logger });
  return { service, grpc, logger };
};

describe('ProjectsService.getProjectNamesByIds', () => {
  it('reads every distinct project in one call', async () => {
    const { service, grpc } = buildService();

    const names = await service.getProjectNamesByIds([3, 5, 3]);

    expect(grpc.getProjectNamesByIds).toHaveBeenCalledTimes(1);
    expect(grpc.getProjectNamesByIds).toHaveBeenCalledWith({ ids: [3, 5] });
    expect([...names]).toEqual([
      [3, 'Proyecto 3'],
      [5, 'Proyecto 5'],
    ]);
  });

  it('splits more ids than project-service accepts into bounded calls', async () => {
    const { service, grpc } = buildService();
    const ids = Array.from(
      { length: MAX_PROJECT_NAME_IDS + 1 },
      (_, i) => i + 1,
    );

    const names = await service.getProjectNamesByIds(ids);

    expect(grpc.getProjectNamesByIds).toHaveBeenCalledTimes(2);
    expect(names.size).toBe(MAX_PROJECT_NAME_IDS + 1);
  });

  it('logs the ids project-service did not return and leaves them out', async () => {
    const { service, logger } = buildService([404]);

    const names = await service.getProjectNamesByIds([3, 404]);

    expect(names.get(3)).toBe('Proyecto 3');
    expect(names.has(404)).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('404'));
  });

  it('does not call project-service without ids', async () => {
    const { service, grpc, logger } = buildService();

    expect((await service.getProjectNamesByIds([])).size).toBe(0);
    expect(grpc.getProjectNamesByIds).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
