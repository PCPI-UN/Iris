import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';

/** CU-86e3vmz0n: the admin panel reads the NRC of a project from GET /projects/:id */
describe('Course section in the project read', () => {
  const course = {
    id: 8,
    nrc: '1234',
    termId: 2,
    name: 'Ingeniería de software',
    professorUserId: 40,
    departmentId: 3,
    departmentName: 'Sistemas',
  };

  const buildService = (academicCourse?: typeof course) => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    const projectsGrpc = {
      getProjectComplete: jest.fn(() =>
        of({
          items: [
            {
              id: 12,
              name: 'P',
              participants: [],
              pendingParticipants: [],
              documents: [],
              tutors: [],
              academicCourse,
            },
          ],
        }),
      ),
    };
    const eventsGrpc = {
      listTerms: jest.fn(() =>
        of({ terms: [{ id: 2, year: 2026, period: '10' }] }),
      ),
    };
    Object.assign(service, {
      projectsService: projectsGrpc,
      eventsService: eventsGrpc,
    });
    return { service, eventsGrpc };
  };

  it('returns the course section with its term code', async () => {
    const { service } = buildService(course);

    const project = await service.getProjectById(12);

    expect(project.academicCourse).toEqual({ ...course, term: '202610' });
  });

  it('does not ask for the terms when the project has no course section', async () => {
    const { service, eventsGrpc } = buildService(undefined);

    const project = await service.getProjectById(12);

    expect(project.academicCourse).toBeUndefined();
    expect(eventsGrpc.listTerms).not.toHaveBeenCalled();
  });
});
