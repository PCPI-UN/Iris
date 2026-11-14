import { ListEventsByIdsUC } from '../list-events-by-ids.uc';
import { ListAwardsByProjectsUC } from '../list-awards-by-projects.uc';
import { EventRepository } from '../../../domain/repositories/event.repository';
import { ListCategoriesByIdsUC } from '../list-categories-by-ids.uc';

describe('Student dashboard use cases (event-service)', () => {
  describe('ListEventsByIdsUC', () => {
    it('looks each id up once', async () => {
      const repo = { findByIds: jest.fn().mockResolvedValue([]) };
      const uc = new ListEventsByIdsUC(repo as unknown as EventRepository);

      await uc.execute({ ids: [3, 1, 3] });

      expect(repo.findByIds).toHaveBeenCalledWith([3, 1]);
    });

    it('does not query when no ids arrive (proto3 omits empty lists)', async () => {
      const repo = { findByIds: jest.fn() };
      const uc = new ListEventsByIdsUC(repo as unknown as EventRepository);

      expect(await uc.execute({})).toEqual([]);
      expect(repo.findByIds).not.toHaveBeenCalled();
    });
  });

  describe('ListAwardsByProjectsUC', () => {
    it('looks each project up once', async () => {
      const repo = { findByProjectIds: jest.fn().mockResolvedValue([]) };
      const uc = new ListAwardsByProjectsUC(repo);

      await uc.execute({ projectIds: [5, 5, 8] });

      expect(repo.findByProjectIds).toHaveBeenCalledWith([5, 8]);
    });

    it('does not query when no project ids arrive', async () => {
      const repo = { findByProjectIds: jest.fn() };
      const uc = new ListAwardsByProjectsUC(repo);

      expect(await uc.execute({ projectIds: [] })).toEqual([]);
      expect(repo.findByProjectIds).not.toHaveBeenCalled();
    });
  });

  describe('ListCategoriesByIdsUC', () => {
    it('looks each category up once', async () => {
      const repo = { findByIds: jest.fn().mockResolvedValue([]) };
      const uc = new ListCategoriesByIdsUC(repo);

      await uc.execute({ ids: [2, 2, 7] });

      expect(repo.findByIds).toHaveBeenCalledWith([2, 7]);
    });

    it('does not query when no ids arrive', async () => {
      const repo = { findByIds: jest.fn() };
      const uc = new ListCategoriesByIdsUC(repo);

      expect(await uc.execute({})).toEqual([]);
      expect(repo.findByIds).not.toHaveBeenCalled();
    });
  });
});
