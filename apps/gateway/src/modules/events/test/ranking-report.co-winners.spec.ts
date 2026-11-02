import { of } from 'rxjs';
import { EventService } from '../events.service';

/**
 * CU-86e3wzr4w: tied projects are co-winners. The ranking report no longer
 * reads the TieBreak table and the public cut keeps every co-winner.
 */
describe('EventService.generateRankingReport - co-winners', () => {
  const projectGrades: Record<number, number> = {
    1: 95,
    2: 90,
    3: 90,
    4: 80,
  };

  const buildService = (rankingConfig: {
    visiblePublic: boolean;
    positions: number;
    gradeVisible: boolean;
  }) => {
    const eventGrpc = {
      getEvent: jest.fn(() => of({ event: { id: 1, name: 'Feria' } })),
      getRankingEventByEventId: jest.fn(() =>
        of({ rankingEvent: rankingConfig }),
      ),
    };
    const evaluationGrpc = {
      getProjectStats: jest.fn(({ projectId }: { projectId: number }) =>
        of({
          evaluatorIds: [],
          evaluationCount: 1,
          averageGrade: projectGrades[projectId],
        }),
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
          items: Object.keys(projectGrades).map((id) => ({
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

    return { service, tieBreakGrpc };
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
});
