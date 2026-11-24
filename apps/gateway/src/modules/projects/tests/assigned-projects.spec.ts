import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';

const evaluation = {
  id: 7,
  projectId: 1,
  userId: 9,
  eventId: 3,
  grade: 4.2,
  comments: 'Buen trabajo',
  date: '2026-11-20T15:00:00.000Z',
  scores: [{ evaluationId: 7, criterionId: 11, score: 4, weight: 0.5 }],
};

/** ProjectsService with only what listAssignedProjectsByJuror uses */
const buildService = (items: Record<string, unknown>[]) => {
  const service = Object.create(ProjectsService.prototype) as ProjectsService;
  const projectsGrpc = {
    listAssignedProjects: jest.fn(() =>
      of({ items, total: items.length, page: 1, pageSize: 20 }),
    ),
  };
  const evaluationGrpc = {
    checkEvaluationStatus: jest.fn(() =>
      of({
        projects: [
          { projectId: 1, evaluated: true, evaluation },
          { projectId: 2, evaluated: false },
        ],
      }),
    ),
  };
  Object.assign(service, {
    projectsService: projectsGrpc,
    evaluationService: evaluationGrpc,
  });
  return { service, projectsGrpc, evaluationGrpc };
};

describe('ProjectsService.listAssignedProjectsByJuror', () => {
  it('returns the project code and keeps the juror evaluation status', async () => {
    const { service } = buildService([
      { id: 1, eventId: 3, name: 'Puente', projectCode: 'A12' },
      { id: 2, eventId: 3, name: 'Represa' },
    ]);

    const res = await service.listAssignedProjectsByJuror(9, 3, 1, 20);

    expect(res.items[0]).toMatchObject({
      id: 1,
      projectCode: 'A12',
      evaluated: true,
      evaluation,
    });
    expect(res.items[1]).toMatchObject({
      id: 2,
      evaluated: false,
      evaluation: null,
    });
    expect(res.items[1].projectCode).toBeUndefined();
  });

  it('does not call evaluation-service without assigned projects', async () => {
    const { service, evaluationGrpc } = buildService([]);

    const res = await service.listAssignedProjectsByJuror(9, 3, 1, 20);

    expect(res.items).toEqual([]);
    expect(evaluationGrpc.checkEvaluationStatus).not.toHaveBeenCalled();
  });
});
