import { NotFoundException } from '@nestjs/common';
import {
  EvaluationReportService,
  groupByComponent,
  splitFeedback,
} from '../evaluation-report.service';

/**
 * CU-86e3vmz0b (report data) and CU-86e3vmz0h (co-winners in the report).
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
    const service = new EvaluationReportService(
      eventsService as any,
      evaluationsService as any,
    );
    return { service, eventsService, evaluationsService };
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
