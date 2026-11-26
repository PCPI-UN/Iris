import { of } from 'rxjs';
import { EventService } from '../events.service';
import { ProjectStateFilter } from '../../projects/dto/list-projects-by-event.dto';

/**
 * CU-86e3wzr4w: tied projects are co-winners. The ranking report no longer
 * reads the TieBreak table and the public cut keeps every co-winner.
 */
describe('EventService.generateRankingReport - co-winners', () => {
  // Project 5 has no evaluations; it must not enter the ranking.
  const projectStats: Record<
    number,
    { averageGrade: number; evaluationCount: number }
  > = {
    1: { averageGrade: 95, evaluationCount: 2 },
    2: { averageGrade: 90, evaluationCount: 2 },
    3: { averageGrade: 90, evaluationCount: 2 },
    4: { averageGrade: 80, evaluationCount: 2 },
    5: { averageGrade: 0, evaluationCount: 0 },
  };

  const buildService = (
    rankingConfig: {
      visiblePublic: boolean;
      positions: number;
      gradeVisible: boolean;
    },
    stats = projectStats,
  ) => {
    const eventGrpc = {
      getEvent: jest.fn(() => of({ event: { id: 1, name: 'Feria' } })),
      getRankingEventByEventId: jest.fn(() =>
        of({ rankingEvent: rankingConfig }),
      ),
    };
    const evaluationGrpc = {
      getProjectStats: jest.fn(({ projectId }: { projectId: number }) =>
        of({ evaluatorIds: [], ...stats[projectId] }),
      ),
    };
    const tieBreakGrpc = { listTieBreaks: jest.fn() };
    const services: Record<string, unknown> = {
      EventService: eventGrpc,
      EvaluationService: evaluationGrpc,
      TieBreakService: tieBreakGrpc,
    };
    const grpcClient = {
      getService: jest.fn((name: string) => services[name] ?? {}),
    };
    const projectsService = {
      listProjectsByEvent: jest.fn(() =>
        Promise.resolve({
          items: Object.keys(stats).map((id) => ({
            id: Number(id),
            name: `Proyecto ${id}`,
            courseId: 7,
            participants: [],
          })),
          totalPages: 1,
        }),
      ),
    };

    const service = new EventService(
      grpcClient as any,
      grpcClient as any,
      grpcClient as any,
      projectsService as any,
      {} as any,
    );
    service.onModuleInit();
    jest
      .spyOn(service, 'listCategoriesByEvent')
      .mockResolvedValue({ categories: [{ id: 7, name: 'Software' }] } as any);

    return { service, tieBreakGrpc, projectsService };
  };

  it('gives co-winners the same position and does not query the TieBreak table', async () => {
    const { service, tieBreakGrpc } = buildService({
      visiblePublic: true,
      positions: 0,
      gradeVisible: true,
    });

    const report = await service.generateRankingReport(1, {}, 'admin');

    expect(report.items.map((i) => [i.projectId, i.position])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
    ]);
    expect(tieBreakGrpc.listTieBreaks).not.toHaveBeenCalled();
  });

  it('includes every co-winner at the last public position', async () => {
    const { service } = buildService({
      visiblePublic: true,
      positions: 2,
      gradeVisible: false,
    });

    const report = await service.generateRankingReport(1, {}, 'public');

    expect(report.items.map((i) => [i.projectId, i.position])).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
    ]);
    expect(report.items.every((i) => i.averageGrade === undefined)).toBe(true);
  });

  it('ranks only approved projects', async () => {
    const { service, projectsService } = buildService({
      visiblePublic: true,
      positions: 0,
      gradeVisible: true,
    });

    await service.generateRankingReport(1, { categoryId: 7 }, 'admin');

    expect(projectsService.listProjectsByEvent).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        courseId: 7,
        state: ProjectStateFilter.APPROVED,
      }),
    );
  });

  it('excludes projects without evaluations', async () => {
    const { service } = buildService({
      visiblePublic: true,
      positions: 0,
      gradeVisible: true,
    });

    const report = await service.generateRankingReport(1, {}, 'admin');

    expect(report.items.map((i) => i.projectId)).not.toContain(5);
  });

  it('returns the rounded average so co-winners show the same grade', async () => {
    const { service } = buildService(
      { visiblePublic: true, positions: 0, gradeVisible: true },
      {
        1: {
          averageGrade: 0.057 * 90 + 0.057 * 90 + 0.057 * 25,
          evaluationCount: 1,
        },
        2: {
          averageGrade: 0.057 * 25 + 0.057 * 90 + 0.057 * 90,
          evaluationCount: 1,
        },
      },
    );

    const report = await service.generateRankingReport(1, {}, 'admin');

    expect(report.items.map((i) => [i.position, i.averageGrade])).toEqual([
      [1, 11.69],
      [1, 11.69],
    ]);
  });
});
