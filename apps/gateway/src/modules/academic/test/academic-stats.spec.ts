import { NotFoundException } from '@nestjs/common';
import { ProjectState } from '@app/common/generated/project';
import { AcademicProfile } from '../academic-profiles';
import { AcademicService } from '../academic.service';
import { byDepartment, scoreDistribution } from '../academic-stats';

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

describe('scoreDistribution', () => {
  it('splits 0..maxScore in 5 equal ranges', () => {
    expect(scoreDistribution([0, 0.99, 1, 4.25, 5], 5)).toEqual([
      { from: 0, to: 1, count: 2 },
      { from: 1, to: 2, count: 1 },
      { from: 2, to: 3, count: 0 },
      { from: 3, to: 4, count: 0 },
      { from: 4, to: 5, count: 2 },
    ]);
  });

  it('puts a score on a boundary in the range that starts there, despite floating point', () => {
    const buckets = scoreDistribution([2.4], 3)!;
    expect(buckets.map((b) => b.from)).toEqual([0, 0.6, 1.2, 1.8, 2.4]);
    expect(buckets[4].count).toBe(1);
  });

  it('keeps scores out of 0..maxScore in the first or last range', () => {
    const buckets = scoreDistribution([-1, 7], 5)!;
    expect(buckets[0].count).toBe(1);
    expect(buckets[4].count).toBe(1);
  });

  it('is null without a grading scale', () => {
    expect(scoreDistribution([3], null)).toBeNull();
  });
});

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

  beforeEach(() => {
    projectsService = {
      listEventIdsInScope: jest.fn().mockResolvedValue([4]),
      // 3 has no evaluation
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
      getAverageGrades: jest.fn().mockResolvedValue([
        { projectId: 1, averageGrade: 4.5, evaluationCount: 2 },
        { projectId: 2, averageGrade: 2.5, evaluationCount: 1 },
        { projectId: 3, averageGrade: 0, evaluationCount: 0 },
      ]),
      fetchCriteriaStats: jest.fn((_eventId: number, ids: number[]) =>
        Promise.resolve({ maxScore: 5, components: components(ids.join(',')) }),
      ),
    };
    service = new AcademicService(
      projectsService,
      eventsService,
      evaluationsService,
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
    expect(evaluationsService.fetchCriteriaStats).not.toHaveBeenCalled();
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

  it('averages only the approved projects of the scope with evaluations', async () => {
    const stats = await service.getStats(DEAN, 4, AS_DEAN);

    expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 4, state: ProjectState.APPROVED }),
    );
    expect(evaluationsService.fetchCriteriaStats).toHaveBeenCalledWith(
      4,
      [1, 2],
    );
    expect(stats).toMatchObject({ statsHidden: false, maxScore: 5 });
    expect(stats.overall).toMatchObject({
      projectCount: 3,
      evaluatedCount: 2,
      components: components('1,2'),
    });
    expect(stats.overall!.distribution!.map((b) => b.count)).toEqual([
      0, 0, 1, 0, 1,
    ]);
  });

  it('adds one block per department with groupBy', async () => {
    const stats = await service.getStats(DEAN, 4, AS_DEAN, true);

    expect(stats.departments).toEqual([
      expect.objectContaining({
        departmentName: 'Civil',
        projectCount: 1,
        evaluatedCount: 1,
        components: components('2'),
      }),
      expect.objectContaining({
        departmentName: 'Sistemas',
        projectCount: 2,
        evaluatedCount: 1,
        components: components('1'),
      }),
    ]);
  });

  it('has no distribution when the event has no grading scale', async () => {
    evaluationsService.fetchCriteriaStats.mockResolvedValue({ components: [] });

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
