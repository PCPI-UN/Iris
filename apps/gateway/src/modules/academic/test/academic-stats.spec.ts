import { NotFoundException } from '@nestjs/common';
import { ProjectState } from '@app/common/generated/project';
import { AcademicProfile } from '../academic-profiles';
import { AcademicService } from '../academic.service';
import { byDepartment } from '../academic-stats';

const user = (roles: string[], permissions: string[] = []) =>
  ({
    id: 5,
    platformRoles: roles.map((name, i) => ({
      id: i + 1,
      name,
      scope: 'PLATFORM',
    })),
    platformPermissions: permissions,
  }) as any;

const PROFESSOR = user(['Professor'], ['read:academic_projects']);
const DEAN = user(['Dean'], ['read:academic_projects', 'read:grades']);
const { PROFESSOR: AS_PROFESSOR, DEAN: AS_DEAN } = AcademicProfile;

const SISTEMAS = {
  id: 2,
  nrc: '1001',
  termId: 3,
  name: 'PF Sistemas',
  departmentId: 1,
  departmentName: 'Sistemas',
};
const CIVIL = {
  id: 3,
  nrc: '2001',
  termId: 3,
  name: 'PF Civil',
  departmentId: 7,
  departmentName: 'Civil',
};

const project = (id: number, academicCourse?: unknown) =>
  ({ id, name: `P${id}`, academicCourse }) as any;

const components = (tag: string) => [
  { id: 1, name: tag, weight: 1, average: 4, projectCount: 1, criteria: [] },
];

describe('byDepartment', () => {
  it('groups by the department of the course section, by name, without one last', () => {
    const groups = byDepartment([
      project(1, SISTEMAS),
      project(2),
      project(3, CIVIL),
      project(4, SISTEMAS),
    ]);
    expect(
      groups.map((g) => [
        g.department.departmentName,
        g.projects.map((p) => p.id),
      ]),
    ).toEqual([
      ['Civil', [3]],
      ['Sistemas', [1, 4]],
      [null, [2]],
    ]);
    expect(groups[2].department).toEqual({
      departmentId: null,
      departmentName: null,
    });
  });
});

describe('AcademicService.getStats', () => {
  let projectsService: any;
  let eventsService: any;
  let evaluationsService: any;
  let service: AcademicService;

  const set = (evaluatedCount: number, tag: string) => ({
    evaluatedCount,
    components: components(tag),
    distribution: [{ from: 0, to: 1, count: evaluatedCount }],
  });

  beforeEach(() => {
    projectsService = {
      listEventIdsInScope: jest.fn().mockResolvedValue([4]),
      listAllProjectsInScope: jest
        .fn()
        .mockResolvedValue([
          project(1, SISTEMAS),
          project(2, CIVIL),
          project(3, SISTEMAS),
        ]),
    };
    eventsService = {
      getEventById: jest.fn().mockResolvedValue({
        id: 4,
        name: 'Feria 2026',
        resultsPublished: false,
        active: true,
      }),
    };
    evaluationsService = {
      getCriteriaStatsByGroups: jest
        .fn()
        .mockImplementation(
          (_eventId: number, _ids: number[], groups: number[][]) =>
            Promise.resolve({
              maxScore: 5,
              ...set(2, 'all'),
              groups: groups.map((ids) => set(ids.length, ids.join(','))),
            }),
        ),
    };
    service = new AcademicService(
      projectsService,
      eventsService,
      evaluationsService,
      { getUser: jest.fn() } as any,
    );
  });

  it('hides the numbers from a professor before the results are published', async () => {
    const stats = await service.getStats(PROFESSOR, 4, AS_PROFESSOR, true);

    expect(stats).toMatchObject({
      statsHidden: true,
      maxScore: null,
      overall: null,
      departments: [],
    });
    expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    expect(evaluationsService.getCriteriaStatsByGroups).not.toHaveBeenCalled();
  });

  it('shows them to a professor once the results are published', async () => {
    eventsService.getEventById.mockResolvedValue({
      id: 4,
      name: 'Feria 2026',
      resultsPublished: true,
      active: true,
    });

    const stats = await service.getStats(PROFESSOR, 4, AS_PROFESSOR);

    expect(stats.statsHidden).toBe(false);
    expect(stats.departments).toBeUndefined();
  });

  it('asks evaluation-service for the approved projects of the scope, without groups', async () => {
    const stats = await service.getStats(DEAN, 4, AS_DEAN);

    expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 4, state: ProjectState.APPROVED }),
    );
    expect(evaluationsService.getCriteriaStatsByGroups).toHaveBeenCalledWith(
      4,
      [1, 2, 3],
      [],
    );
    expect(stats).toEqual(
      expect.objectContaining({
        statsHidden: false,
        maxScore: 5,
        overall: { projectCount: 3, ...set(2, 'all') },
      }),
    );
  });

  it('adds one block per department with groupBy, from the same call', async () => {
    const stats = await service.getStats(DEAN, 4, AS_DEAN, true);

    expect(evaluationsService.getCriteriaStatsByGroups).toHaveBeenCalledTimes(
      1,
    );
    expect(evaluationsService.getCriteriaStatsByGroups).toHaveBeenCalledWith(
      4,
      [1, 2, 3],
      [[2], [1, 3]],
    );
    expect(stats.departments).toEqual([
      {
        departmentId: 7,
        departmentName: 'Civil',
        projectCount: 1,
        ...set(1, '2'),
      },
      {
        departmentId: 1,
        departmentName: 'Sistemas',
        projectCount: 2,
        ...set(2, '1,3'),
      },
    ]);
  });

  it('has no distribution when the event has no grading scale', async () => {
    evaluationsService.getCriteriaStatsByGroups.mockResolvedValue({
      ...set(0, 'all'),
      distribution: [],
      groups: [],
    });

    const stats = await service.getStats(DEAN, 4, AS_DEAN);

    expect(stats.maxScore).toBeNull();
    expect(stats.overall!.distribution).toBeNull();
  });

  it('is a 404 for an event outside the scope', async () => {
    projectsService.listEventIdsInScope.mockResolvedValue([8]);

    await expect(service.getStats(DEAN, 4, AS_DEAN)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
