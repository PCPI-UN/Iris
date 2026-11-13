import { of, throwError } from 'rxjs';
import { ProjectsService } from '../projects.service';

/** ProjectsService with only what getProjectNamesByIds uses */
const buildService = () => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const grpc = {
    getProject: jest.fn(({ id }: { id: number }) =>
      id === 404
        ? throwError(() => new Error('5 NOT_FOUND'))
        : of({ project: { id, name: `Proyecto ${id}` } }),
    ),
  };
  Object.assign(service, {
    projectsService: grpc,
    logger: { warn: jest.fn() },
  });
  return { service, grpc };
};

describe('ProjectsService.getProjectNamesByIds', () => {
  it('reads each project once', async () => {
    const { service, grpc } = buildService();

    const names = await service.getProjectNamesByIds([3, 5, 3]);

    expect(grpc.getProject).toHaveBeenCalledTimes(2);
    expect([...names]).toEqual([
      [3, 'Proyecto 3'],
      [5, 'Proyecto 5'],
    ]);
  });

  it('leaves out a project that cannot be read instead of failing', async () => {
    const { service } = buildService();

    const names = await service.getProjectNamesByIds([3, 404]);

    expect(names.get(3)).toBe('Proyecto 3');
    expect(names.has(404)).toBe(false);
  });
});
