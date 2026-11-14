import { NotFoundException } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { StudentResultsService } from './student-results.service';
import { EventService } from '../events/events.service';
import { ProjectsService } from '../projects/projects.service';
import { EvaluationsService } from '../evaluations/evaluations.service';

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

  // Averages of the approved projects of the category; project 34 is the caller's
  const categoryGrades = [
    { projectId: 8, averageGrade: 80 },
    { projectId: 9, averageGrade: 80 },
    { projectId: 34, averageGrade: 72.5 },
  ];

  const build = (
    options: {
      published?: boolean;
      result?: object;
      grades?: { projectId: number; averageGrade: number }[];
      rankingConfig?: () => Promise<object>;
      approved?: () => Promise<{ id: number }[]>;
      awards?: object[];
    } = {},
  ) => {
    const projects = {
      getMyProjectByEvent: jest
        .fn()
        .mockResolvedValue({ project: { id: 34, courseId: 6 } }),
    };
    const events = {
      getEventById: jest.fn().mockResolvedValue({
        id: 3,
        resultsPublished: options.published ?? true,
      }),
      get: jest.fn(),
      getRankingEventByEventId: jest.fn(
        options.rankingConfig ??
          (() => Promise.resolve({ rankingEvent: { id: 1, eventId: 3 } })),
      ),
      listApprovedProjects: jest.fn(
        options.approved ??
          (() => Promise.resolve([{ id: 8 }, { id: 9 }, { id: 34 }])),
      ),
      getCategory: jest
        .fn()
        .mockResolvedValue({ category: { id: 6, name: ' Sistemas ' } }),
      listAwardsByProjects: jest
        .fn()
        .mockResolvedValue({ awards: options.awards ?? [] }),
      generateRankingReport: jest.fn(),
    };
    const evaluations = {
      getProjectResult: jest
        .fn()
        .mockResolvedValue(options.result ?? evaluatedResult),
      getAverageGrades: jest
        .fn()
        .mockResolvedValue(options.grades ?? categoryGrades),
    };
    const service = new StudentResultsService(
      events as unknown as EventService,
      projects as unknown as ProjectsService,
      evaluations as unknown as EvaluationsService,
    );
    return { service, projects, events, evaluations };
  };

  it('looks up the session user project and the event without its catalog', async () => {
    const { service, projects, events } = build();

    await service.getMyResults(7, 3);

    expect(projects.getMyProjectByEvent).toHaveBeenCalledWith(7, 3);
    expect(events.getEventById).toHaveBeenCalledWith(3);
    expect(events.get).not.toHaveBeenCalled();
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
    expect(events.getRankingEventByEventId).not.toHaveBeenCalled();
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

  it('computes the position from the category averages in one call, not from the admin report', async () => {
    const { service, events, evaluations } = build();

    await service.getMyResults(7, 3);

    expect(events.listApprovedProjects).toHaveBeenCalledWith(3, 6);
    expect(evaluations.getAverageGrades).toHaveBeenCalledTimes(1);
    expect(evaluations.getAverageGrades).toHaveBeenCalledWith([8, 9, 34]);
    expect(events.generateRankingReport).not.toHaveBeenCalled();
  });

  it('never sends juror data nor other projects of the ranking', async () => {
    const { service } = build();

    const text = JSON.stringify(await service.getMyResults(7, 3));

    expect(text).not.toMatch(
      /evaluator|juror|evaluationCount|individualGrades/i,
    );
    expect(text).not.toContain('"projectId":8');
    expect(text).not.toContain('"projectId":9');
    expect(text).not.toContain('80');
  });

  it('marks co-winners and lists the published awards of the event', async () => {
    const { service } = build({
      grades: [
        { projectId: 34, averageGrade: 80 },
        { projectId: 9, averageGrade: 80 },
        { projectId: 8, averageGrade: 70 },
      ],
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
    const { service, events } = build({
      rankingConfig: () =>
        Promise.reject(
          Object.assign(new Error('not found'), { code: status.NOT_FOUND }),
        ),
    });

    const result = await service.getMyResults(7, 3);

    expect(result.ranking).toBeNull();
    expect(result.finalScore).toBe(72.5);
    expect(events.listApprovedProjects).not.toHaveBeenCalled();
  });

  it('keeps the score and the feedback when the ranking cannot be computed', async () => {
    const { service } = build({
      approved: () => Promise.reject(new Error('deadline exceeded')),
    });

    const result = await service.getMyResults(7, 3);

    expect(result.ranking).toBeNull();
    expect(result.finalScore).toBe(72.5);
    expect(result.consolidatedFeedback).toBe(
      'Buena solución.\n\nAmpliar las pruebas.',
    );
  });

  it('has no ranking when the project has no average in its category', async () => {
    const { service } = build({ grades: [{ projectId: 8, averageGrade: 80 }] });

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
    expect(events.getRankingEventByEventId).not.toHaveBeenCalled();
  });
});
