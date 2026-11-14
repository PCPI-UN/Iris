import { GetProjectNamesByIdsUC } from '../get-project-names-by-ids.uc';
import { MAX_PROJECT_NAME_IDS } from '@app/common/constants/projects';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { ValidationError } from '../../../domain/errors';

describe('GetProjectNamesByIdsUC', () => {
  const build = () => {
    const repo = {
      findNamesByIds: jest
        .fn()
        .mockResolvedValue([{ id: 3, name: 'Robot clasificador' }]),
    };
    const uc = new GetProjectNamesByIdsUC(repo as unknown as ProjectRepository);
    return { uc, repo };
  };

  it('reads every project in one query, each id once', async () => {
    const { uc, repo } = build();

    const result = await uc.execute({ ids: [3, 5, 3] });

    expect(repo.findNamesByIds).toHaveBeenCalledTimes(1);
    expect(repo.findNamesByIds).toHaveBeenCalledWith([3, 5]);
    expect(result).toEqual([{ id: 3, name: 'Robot clasificador' }]);
  });

  it('does not query when no ids arrive (proto3 omits empty lists)', async () => {
    const { uc, repo } = build();

    expect(await uc.execute({})).toEqual([]);
    expect(repo.findNamesByIds).not.toHaveBeenCalled();
  });

  it('rejects more ids than the limit', async () => {
    const { uc, repo } = build();
    const ids = Array.from({ length: MAX_PROJECT_NAME_IDS + 1 }, (_, i) => i + 1);

    await expect(uc.execute({ ids })).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findNamesByIds).not.toHaveBeenCalled();
  });

  it('rejects ids that are not positive integers', async () => {
    const { uc } = build();

    await expect(uc.execute({ ids: [0] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
