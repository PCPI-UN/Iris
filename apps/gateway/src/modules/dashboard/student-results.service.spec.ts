import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentResultsService } from './student-results.service';
import { EventService } from '../events/events.service';
import { ProjectsService } from '../projects/projects.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { RankingReportFormat } from '../events/dto/ranking-report/get-ranking-report.dto';

describe('StudentResultsService', () => {
  const evaluatedResult = {
    evaluated: true,
    finalScore: 72.5,
    maxScore: 90,
    criteria: [
      {
        criterionId: 1,
        criterion: 'Problema',
        component: 'Fundamentación',
        weight: 0.1067,
        score: 75,
      },
    ],
    consolidatedFeedback: 'Buena solución.\n\nAmpliar las pruebas.',
  };

  const rankingItems = [
    { projectId: 8, position: 1, category: 'Sistemas' },
    { projectId: 9, position: 1, category: 'Sistemas' },
    { projectId: 34, position: 2, category: 'Sistemas' },
  ];

  const build = (
    options: {
      published?: boolean;
      result?: object;
      ranking?: () => Promise<{ items: typeof rankingItems }>;
      awards?: object[];
    } = {},
  ) => {
    const projects = {
      getMyProjectByEvent: jest
        .fn()
        .mockResolvedValue({ project: { id: 34, courseId: 6 } }),
    };
    const events = {
      get: jest.fn().mockResolvedValue({
        event: { id: 3, resultsPublished: options.published ?? true },
      }),
      generateRankingReport: jest.fn(
        options.ranking ?? (() => Promise.resolve({ items: rankingItems })),
      ),
      listAwardsByProjects: jest
        .fn()
        .mockResolvedValue({ awards: options.awards ?? [] }),
    };
    const evaluations = {
      getProjectResult: jest
        .fn()
        .mockResolvedValue(options.result ?? evaluatedResult),
    };
    const service = new StudentResultsService(
      events as unknown as EventService,
      projects as unknown as ProjectsService,
      evaluations as unknown as EvaluationsService,
    );
    return { service, projects, events, evaluations };
  };

  it('looks up the session user project in the event', async () => {
    const { service, projects } = build();

    await service.getMyResults(7, 3);

    expect(projects.getMyProjectByEvent).toHaveBeenCalledWith(7, 3);
  });

  it('fails when the user has no project in the event', async () => {
    const { service, projects, evaluations } = build();
    projects.getMyProjectByEvent.mockRejectedValue(new NotFoundException());

    await expect(service.getMyResults(7, 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(evaluations.getProjectResult).not.toHaveBeenCalled();
  });

  it('sends only resultsPublished: false before the admin publishes', async () => {
    const { service, evaluations, events } = build({ published: false });

    const result = await service.getMyResults(7, 3);

    expect(result).toEqual({ resultsPublished: false });
    expect(evaluations.getProjectResult).not.toHaveBeenCalled();
    expect(events.generateRankingReport).not.toHaveBeenCalled();
  });

  it('returns the consolidated result once published', async () => {
    const { service } = build();

    const result = await service.getMyResults(7, 3);

    expect(result).toEqual({
      resultsPublished: true,
      evaluated: true,
      finalScore: 72.5,
      maxScore: 90,
      ranking: {
        position: 2,
        isWinner: false,
        isCoWinner: false,
        categoryName: 'Sistemas',
        awardTitle: null,
      },
      criteriaScores: [
        {
          id: 1,
          criterion: 'Problema',
          component: 'Fundamentación',
          weight: 10.67,
          score: 75,
          maxScore: 90,
        },
      ],
      consolidatedFeedback: 'Buena solución.\n\nAmpliar las pruebas.',
    });
  });

  it('never sends juror data nor other projects of the ranking', async () => {
    const { service } = build();

    const result = await service.getMyResults(7, 3);
    const text = JSON.stringify(result);

    expect(text).not.toMatch(
      /evaluator|juror|evaluationCount|individualGrades/i,
    );
    expect(text).not.toContain('"projectId":8');
    expect(text).not.toContain('"projectId":9');
  });

  it('ranks the project inside its own category with the admin ranking', async () => {
    const { service, events } = build();

    await service.getMyResults(7, 3);

    expect(events.generateRankingReport).toHaveBeenCalledWith(
      3,
      { categoryId: 6, format: RankingReportFormat.JSON },
      'admin',
    );
  });

  it('marks co-winners', async () => {
    const { service } = build({
      ranking: () =>
        Promise.resolve({
          items: [
            { projectId: 34, position: 1, category: 'Sistemas' },
            { projectId: 9, position: 1, category: 'Sistemas' },
          ],
        }),
      awards: [
        {
          projectId: 34,
          eventId: 3,
          title: 'Primer puesto',
          resultsPublished: true,
        },
        {
          projectId: 34,
          eventId: 2,
          title: 'Otro evento',
          resultsPublished: true,
        },
      ],
    });

    const { ranking } = await service.getMyResults(7, 3);

    expect(ranking).toEqual({
      position: 1,
      isWinner: true,
      isCoWinner: true,
      categoryName: 'Sistemas',
      awardTitle: 'Primer puesto',
    });
  });

  it('has no ranking when the event has no ranking configuration', async () => {
    const { service } = build({
      ranking: () => Promise.reject(new BadRequestException('no ranking')),
    });

    const result = await service.getMyResults(7, 3);

    expect(result.ranking).toBeNull();
    expect(result.finalScore).toBe(72.5);
  });

  it('has no ranking when the project is not in it', async () => {
    const { service } = build({
      ranking: () =>
        Promise.resolve({
          items: [{ projectId: 8, position: 1, category: 'Sistemas' }],
        }),
    });

    const { ranking } = await service.getMyResults(7, 3);

    expect(ranking).toBeNull();
  });

  it('reports a published but not evaluated project without scores', async () => {
    const { service, events } = build({
      result: { evaluated: false, finalScore: 0, maxScore: 5, criteria: [] },
    });

    const result = await service.getMyResults(7, 3);

    expect(result).toEqual({
      resultsPublished: true,
      evaluated: false,
      finalScore: null,
      maxScore: 5,
      ranking: null,
      criteriaScores: [],
      consolidatedFeedback: '',
    });
    expect(events.generateRankingReport).not.toHaveBeenCalled();
  });
});
