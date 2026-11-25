import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EvaluationReportService,
  groupByComponent,
  splitFeedback,
} from '../evaluation-report.service';
import { AcademicProfile } from '../../academic/academic-profiles';
import { AcademicScope } from '@app/common/generated/project';

/**
 * CU-86e3vmz0b (report data), CU-86e3vmz0h (co-winners in the report) and
 * CU-86e3vmz0c (download per user type).
 */
describe('EvaluationReportService', () => {
  const criteria = [
    {
      criterionId: 1,
      criterion: 'Claridad',
      component: 'Exposición',
      weight: 0.2,
      score: 80,
    },
    {
      criterionId: 2,
      criterion: 'Dominio',
      component: 'Exposición',
      weight: 0.3,
      score: 90,
    },
    {
      criterionId: 3,
      criterion: 'Diseño',
      component: 'Solución',
      weight: 0.5,
      score: 85,
    },
  ];

  // Projects 2 and 3 tie; project 4 has no evaluations
  const averages = [
    { projectId: 1, averageGrade: 80.5, evaluationCount: 3 },
    { projectId: 2, averageGrade: 90, evaluationCount: 2 },
    { projectId: 3, averageGrade: 90, evaluationCount: 4 },
  ];

  const build = (overrides: { category?: unknown; event?: unknown } = {}) => {
    const eventsService = {
      getEventById: jest.fn(() =>
        Promise.resolve(
          'event' in overrides
            ? overrides.event
            : { id: 10, name: ' Feria 2026 ' },
        ),
      ),
      getCategory: jest.fn(() =>
        Promise.resolve({
          category:
            'category' in overrides
              ? overrides.category
              : { id: 7, eventId: 10, name: 'Ingeniería Civil' },
        }),
      ),
      listApprovedProjects: jest.fn(() =>
        Promise.resolve(
          [4, 3, 2, 1].map((id) => ({
            id,
            name: `Proyecto ${id}`,
            projectCode: id === 1 ? 'P-1' : '',
            courseId: 7,
          })),
        ),
      ),
      getProjectParticipantNames: jest.fn((p: { id: number }) => [
        `Estudiante ${p.id}`,
      ]),
      getRankingEventByEventId: jest.fn(
        (): Promise<{ rankingEvent?: unknown }> =>
          Promise.resolve({ rankingEvent: { id: 1, eventId: 10 } }),
      ),
    };
    const evaluationsService = {
      getAverageGrades: jest.fn(() => Promise.resolve(averages)),
      getProjectResult: jest.fn((projectId: number) =>
        Promise.resolve(
          projectId === 4
            ? {
                evaluated: false,
                finalScore: 0,
                maxScore: 100,
                criteria: [],
                consolidatedFeedback: '',
              }
            : {
                evaluated: true,
                finalScore: 0,
                maxScore: 100,
                criteria,
                consolidatedFeedback:
                  projectId === 1 ? 'Buen trabajo\n\n  Falta el costo  ' : '',
              },
        ),
      ),
    };
    const projectsService = {
      // Project 3 is tutored by the caller in category 7; project 9 is of another category
      listAllProjectsInScope: jest.fn(() =>
        Promise.resolve([
          { id: 3, courseId: 7 },
          { id: 9, courseId: 8 },
        ]),
      ),
      getMyProjectByEvent: jest.fn(() =>
        Promise.resolve({ project: { id: 1, courseId: 7 } }),
      ),
    };
    const service = new EvaluationReportService(
      eventsService as any,
      evaluationsService as any,
      projectsService as any,
    );
    return { service, eventsService, evaluationsService, projectsService };
  };

  it('orders by position, co-winners share it and unevaluated projects go last', async () => {
    const { service } = build();

    const report = await service.build(10, 7);

    expect(
      report.projects.map((p) => [p.projectId, p.position, p.rowNumber]),
    ).toEqual([
      [2, 1, 1],
      [3, 1, 2],
      [1, 2, 3],
      [4, null, 4],
    ]);
  });

  it('uses the ranking averages as final grade without changing them', async () => {
    const { service } = build();

    const report = await service.build(10, 7);
    const byId = new Map(report.projects.map((p) => [p.projectId, p]));

    expect(byId.get(1)).toMatchObject({
      finalScore: 80.5,
      jurorCount: 3,
      evaluated: true,
    });
    expect(byId.get(3)).toMatchObject({ finalScore: 90, jurorCount: 4 });
    expect(byId.get(4)).toMatchObject({
      evaluated: false,
      finalScore: null,
      jurorCount: 0,
      components: [],
    });
  });

  it('fills the event, category and project data', async () => {
    const { service, evaluationsService } = build();

    const report = await service.build(10, 7);

    expect(report).toMatchObject({
      eventId: 10,
      eventName: 'Feria 2026',
      categoryId: 7,
      categoryName: 'Ingeniería Civil',
      maxScore: 100,
    });
    const first = report.projects.find((p) => p.projectId === 1)!;
    expect(first).toMatchObject({
      projectCode: 'P-1',
      projectName: 'Proyecto 1',
      participantNames: ['Estudiante 1'],
      comments: ['Buen trabajo', 'Falta el costo'],
    });
    expect(
      report.projects.find((p) => p.projectId === 2)!.projectCode,
    ).toBeUndefined();
    expect(evaluationsService.getAverageGrades).toHaveBeenCalledWith([
      4, 3, 2, 1,
    ]);
    expect(evaluationsService.getProjectResult).toHaveBeenCalledTimes(4);
  });

  it('rejects a category of another event', async () => {
    const { service } = build({
      category: { id: 7, eventId: 99, name: 'Otra' },
    });

    await expect(service.build(10, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an event that does not exist', async () => {
    const { service } = build({ event: undefined });

    await expect(service.build(10, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists an empty category without failing', async () => {
    const { service, eventsService, evaluationsService } = build();
    eventsService.listApprovedProjects.mockResolvedValueOnce([]);
    evaluationsService.getAverageGrades.mockResolvedValueOnce([]);

    const report = await service.build(10, 7);

    expect(report.projects).toEqual([]);
    expect(report.maxScore).toBe(0);
  });

  it('lists only the given projects but keeps their real positions', async () => {
    const { service, evaluationsService } = build();

    const report = await service.build(10, 7, { projectIds: [1, 4] });

    expect(
      report.projects.map((p) => [p.projectId, p.position, p.rowNumber]),
    ).toEqual([
      [1, 2, 1],
      [4, null, 2],
    ]);
    // Averages of the whole category for the positions, results only of the rows shown
    expect(evaluationsService.getAverageGrades).toHaveBeenCalledWith([
      4, 3, 2, 1,
    ]);
    expect(evaluationsService.getProjectResult).toHaveBeenCalledTimes(2);
  });

  /** CU-86e3vmz0c: who downloads which rows */
  describe('who downloads the report', () => {
    const user = (permissions: string[], roles: string[] = []): any => ({
      id: 50,
      platformRoles: roles.map((name) => ({ name })),
      platformPermissions: permissions,
    });
    const published = { id: 10, name: 'Feria', resultsPublished: true };

    it('gives the whole category to read:grades before publication', async () => {
      const { service, projectsService } = build();

      const report = await service.buildForUser(
        user(['read:grades', 'read:academic_projects']),
        10,
        7,
      );

      expect(report.projects.map((p) => p.projectId)).toEqual([2, 3, 1, 4]);
      expect(report.showJurorCount).toBe(true);
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });

    it('gives the whole category to Admin without listing permissions', async () => {
      const { service } = build();

      const report = await service.buildForUser(user([], ['Admin']), 10, 7);

      expect(report.projects).toHaveLength(4);
    });

    it('limits an academic role to the projects of its scope in the category', async () => {
      const { service, projectsService } = build({ event: published });

      const report = await service.buildForUser(
        user(['read:academic_projects']),
        10,
        7,
      );

      expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({
        userId: 50,
        eventId: 10,
      });
      // Project 3 keeps its real position: co-winner of the first place
      expect(
        report.projects.map((p) => [p.projectId, p.position, p.jurorCount]),
      ).toEqual([[3, 1, 4]]);
    });

    it('limits the report to the scope of the profile it is asked from', async () => {
      const { service, projectsService } = build({ event: published });

      const report = await service.buildForUser(
        user(['read:academic_projects'], ['Professor', 'Tutor']),
        10,
        7,
        AcademicProfile.TUTOR,
      );

      expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({
        userId: 50,
        eventId: 10,
        scope: AcademicScope.ACADEMIC_SCOPE_TUTORED,
      });
      expect(report.projects.map((p) => p.projectId)).toEqual([3]);
    });

    it('keeps read:grades before publication but within the profile scope', async () => {
      const { service, projectsService } = build({
        event: { id: 10, name: 'Feria', resultsPublished: false },
      });

      const report = await service.buildForUser(
        user(['read:grades', 'read:academic_projects'], ['Dean']),
        10,
        7,
        AcademicProfile.DEAN,
      );

      expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({
        userId: 50,
        eventId: 10,
        scope: AcademicScope.ACADEMIC_SCOPE_ALL,
      });
      expect(report.projects.map((p) => p.projectId)).toEqual([3]);
    });

    it('refuses a profile the user does not have, even to Admin', async () => {
      const { service, projectsService } = build({ event: published });

      await expect(
        service.buildForUser(user([], ['Admin']), 10, 7, AcademicProfile.DEAN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });

    it('refuses an academic role before the results are published', async () => {
      const { service, projectsService } = build({
        event: { id: 10, name: 'Feria', resultsPublished: false },
      });

      await expect(
        service.buildForUser(user(['read:academic_projects']), 10, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });

    it('answers 404 when the academic role has no projects in the category', async () => {
      const { service, evaluationsService } = build({ event: published });

      await expect(
        service.buildForUser(user(['read:academic_projects']), 10, 99),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(evaluationsService.getAverageGrades).not.toHaveBeenCalled();
    });

    it('answers 404 when the projects of the scope in the category are not approved', async () => {
      // Project 9 is in scope in category 8 but is not among the approved projects
      const { service } = build({ event: published });

      await expect(
        service.buildForUser(user(['read:academic_projects']), 10, 8),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a user without read:grades nor read:academic_projects', async () => {
      const { service, eventsService } = build({ event: published });

      await expect(
        service.buildForUser(user(['view:own_data']), 10, 7),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(eventsService.getEventById).not.toHaveBeenCalled();
    });

    it('gives the student only their project, without the number of jurors', async () => {
      const { service, projectsService } = build({ event: published });

      const report = await service.buildForStudent(50, 10);

      expect(projectsService.getMyProjectByEvent).toHaveBeenCalledWith(50, 10);
      expect(report.showJurorCount).toBe(false);
      expect(report.projects).toHaveLength(1);
      expect(report.projects[0]).toMatchObject({
        projectId: 1,
        position: 2,
        jurorCount: null,
        rowNumber: 1,
      });
    });

    it('refuses the student report before the results are published', async () => {
      const { service, evaluationsService } = build();

      await expect(service.buildForStudent(50, 10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(evaluationsService.getProjectResult).not.toHaveBeenCalled();
    });

    it('answers 404 when the student project is not approved', async () => {
      const { service, projectsService } = build({ event: published });
      projectsService.getMyProjectByEvent.mockResolvedValueOnce({
        project: { id: 77, courseId: 7 },
      });

      await expect(service.buildForStudent(50, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    /** Same rule as the student results: no ranking configuration, no position */
    describe('event without ranking configuration', () => {
      const noRanking = Object.assign(new Error('Ranking config not found'), {
        code: 5, // gRPC NOT_FOUND
      });

      it('leaves the position out of the student report', async () => {
        const { service, eventsService } = build({ event: published });
        eventsService.getRankingEventByEventId.mockRejectedValueOnce(noRanking);

        const report = await service.buildForStudent(50, 10);

        expect(report.showPositions).toBe(false);
        expect(report.projects[0]).toMatchObject({
          projectId: 1,
          position: null,
          finalScore: 80.5,
        });
      });

      it('leaves the positions out of an academic role report', async () => {
        const { service, eventsService } = build({ event: published });
        eventsService.getRankingEventByEventId.mockRejectedValueOnce(noRanking);

        const report = await service.buildForUser(
          user(['read:academic_projects']),
          10,
          7,
        );

        expect(report.showPositions).toBe(false);
        expect(report.projects.map((p) => [p.projectId, p.position])).toEqual([
          [3, null],
        ]);
      });

      it('also treats an empty ranking response as no ranking', async () => {
        const { service, eventsService } = build({ event: published });
        eventsService.getRankingEventByEventId.mockResolvedValueOnce({});

        const report = await service.buildForStudent(50, 10);

        expect(report.projects[0].position).toBeNull();
      });

      it('keeps the positions in the whole category report of read:grades', async () => {
        const { service, eventsService } = build();
        eventsService.getRankingEventByEventId.mockRejectedValue(noRanking);

        const report = await service.buildForUser(user(['read:grades']), 10, 7);

        expect(report.showPositions).toBe(true);
        expect(report.projects[0].position).toBe(1);
        expect(eventsService.getRankingEventByEventId).not.toHaveBeenCalled();
      });

      it('fails instead of hiding the positions when event-service fails', async () => {
        const { service, eventsService } = build({ event: published });
        eventsService.getRankingEventByEventId.mockRejectedValueOnce(
          Object.assign(new Error('unavailable'), { code: 14 }),
        );

        await expect(service.buildForStudent(50, 10)).rejects.toThrow(
          'unavailable',
        );
      });
    });
  });

  describe('groupByComponent', () => {
    it('groups criteria and sums the component weight from its criteria', () => {
      expect(groupByComponent({ criteria } as any)).toEqual([
        {
          component: 'Exposición',
          weight: 0.5,
          criteria: [
            { criterionId: 1, criterion: 'Claridad', weight: 0.2, score: 80 },
            { criterionId: 2, criterion: 'Dominio', weight: 0.3, score: 90 },
          ],
        },
        {
          component: 'Solución',
          weight: 0.5,
          criteria: [
            { criterionId: 3, criterion: 'Diseño', weight: 0.5, score: 85 },
          ],
        },
      ]);
    });

    it('keeps the effective weights as stored when they do not add up to 1', () => {
      const weights = [0.057, 0.057, 0.057, 0.057, 0.057, 0.057, 0.057];
      const grouped = groupByComponent({
        criteria: weights.map((weight, index) => ({
          criterionId: index + 1,
          criterion: `C${index}`,
          component: 'Descripción del Diseño',
          weight,
          score: 80,
        })),
      } as any);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].weight).toBe(0.399);
      expect(grouped[0].criteria.every((c) => c.weight === 0.057)).toBe(true);
    });

    it('names a criterion without component', () => {
      const [component] = groupByComponent({
        criteria: [
          {
            criterionId: 1,
            criterion: 'Uno',
            component: '',
            weight: 1,
            score: 3,
          },
        ],
      } as any);
      expect(component.component).toBe('Sin componente');
    });
  });

  describe('splitFeedback', () => {
    it('returns each juror comment trimmed and drops empty ones', () => {
      expect(splitFeedback(' Uno \n\n\n\nDos\n\n ')).toEqual(['Uno', 'Dos']);
      expect(splitFeedback('')).toEqual([]);
      expect(splitFeedback(undefined)).toEqual([]);
    });

    it('keeps single line breaks inside a comment', () => {
      expect(splitFeedback('Línea 1\nLínea 2\n\nOtro')).toEqual([
        'Línea 1\nLínea 2',
        'Otro',
      ]);
    });
  });
});
