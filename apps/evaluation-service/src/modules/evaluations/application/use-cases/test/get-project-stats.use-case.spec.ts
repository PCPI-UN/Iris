import { GetProjectStatsUseCase } from '../get-project-stats.use-case';
import {
  EvaluationRepositoryPort,
  ProjectStats,
} from '../../../domain/repositories/evaluation.repository.port';

describe('GetProjectStatsUseCase', () => {
  it('returns the grade, the evaluation count and the jurors of the project', async () => {
    const stats: ProjectStats = {
      averageGrade: 75.5,
      evaluationCount: 2,
      evaluatorIds: [4, 9],
    };
    const getProjectStats = jest.fn().mockResolvedValue(stats);
    const repository = {
      getProjectStats,
    } as unknown as EvaluationRepositoryPort;

    const result = await new GetProjectStatsUseCase(repository).execute({
      projectId: 1,
    });

    expect(getProjectStats).toHaveBeenCalledWith(1);
    expect(result).toEqual(stats);
  });
});
