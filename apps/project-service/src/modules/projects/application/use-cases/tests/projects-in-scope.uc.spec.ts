import { ResolveProjectReadScopeUC } from '../resolve-project-read-scope.uc';
import { ListProjectsInScopeUC } from '../list-projects-in-scope.uc';
import { GetProjectInScopeUC } from '../get-project-in-scope.uc';
import { ListEventIdsInScopeUC } from '../list-event-ids-in-scope.uc';
import { AttachParticipantNamesUC } from '../attach-participant-names.uc';
import { NotFoundError } from '../../../domain/errors';
import { ACADEMIC_READER_ROLE_IDS } from '../../../domain/read-scope';

const TUTOR_SCOPE = { all: false, userId: 5, asTutor: true, asProfessor: false, asDirector: false };

describe('ResolveProjectReadScopeUC', () => {
  it('asks auth-service for the academic roles of the user only', async () => {
    const auth = { findUsersByRoles: jest.fn().mockResolvedValue([{ id: 5, roleIds: [10] }]) };

    const scope = await new ResolveProjectReadScopeUC(auth as any).execute(5);

    expect(auth.findUsersByRoles).toHaveBeenCalledWith({ roleIds: ACADEMIC_READER_ROLE_IDS, userIds: [5] });
    expect(scope).toEqual(TUTOR_SCOPE);
  });

  it('returns null when the user holds none of those roles (auth returns no user)', async () => {
    const auth = { findUsersByRoles: jest.fn().mockResolvedValue([]) };

    await expect(new ResolveProjectReadScopeUC(auth as any).execute(5)).resolves.toBeNull();
  });
});

describe('academic read use-cases', () => {
  let repo: any;
  let resolveScope: { execute: jest.Mock };
  // Marks the projects it receives, to check they went through it
  const attachNames = { execute: jest.fn(async (projects: any[]) => projects.map((p) => ({ ...p, named: true }))) };

  beforeEach(() => {
    repo = {
      listInScope: jest.fn().mockResolvedValue({ items: [{ id: 1 }, { id: 2 }], total: 12 }),
      findInScope: jest.fn().mockResolvedValue({ id: 3 }),
      listEventIdsInScope: jest.fn().mockResolvedValue([4, 8]),
    };
    resolveScope = { execute: jest.fn().mockResolvedValue(TUTOR_SCOPE) };
  });

  describe('ListProjectsInScopeUC', () => {
    const build = () => new ListProjectsInScopeUC(repo, resolveScope as any, attachNames as any);

    it('lists the projects of the scope with the filters and the pagination', async () => {
      const page = await build().execute({
        userId: 5, eventId: 4, state: 'APPROVED', academicCourseId: 2, q: '  eco ', currentPage: 2, itemsPerPage: 10,
      });

      expect(repo.listInScope).toHaveBeenCalledWith(TUTOR_SCOPE, {
        eventId: 4, state: 'APPROVED', academicCourseId: 2, q: 'eco', currentPage: 2, itemsPerPage: 10,
      });
      expect(page).toEqual({
        items: [{ id: 1, named: true }, { id: 2, named: true }], total: 12, currentPage: 2, itemsOnCurrentPage: 2, itemsPerPage: 10, totalPages: 2,
      });
    });

    it('defaults to page 1 of 10 and caps the page size at 100', async () => {
      await build().execute({ userId: 5 });
      expect(repo.listInScope.mock.calls[0][1]).toMatchObject({ currentPage: 1, itemsPerPage: 10, q: undefined });

      await build().execute({ userId: 5, itemsPerPage: 5000 });
      expect(repo.listInScope.mock.calls[1][1]).toMatchObject({ itemsPerPage: 100 });
    });

    it('returns an empty page without querying when the user has no scope', async () => {
      resolveScope.execute.mockResolvedValue(null);

      const page = await build().execute({ userId: 5 });

      expect(repo.listInScope).not.toHaveBeenCalled();
      expect(page).toMatchObject({ items: [], total: 0, totalPages: 0 });
    });
  });

  describe('GetProjectInScopeUC', () => {
    const build = () => new GetProjectInScopeUC(repo, resolveScope as any, attachNames as any);

    it('returns the project of the scope', async () => {
      await expect(build().execute({ userId: 5, projectId: 3 })).resolves.toEqual({ id: 3, named: true });
      expect(repo.findInScope).toHaveBeenCalledWith(TUTOR_SCOPE, 3);
    });

    it('a project outside the scope is NOT_FOUND, like a missing one', async () => {
      repo.findInScope.mockResolvedValue(null);

      await expect(build().execute({ userId: 5, projectId: 3 })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('is NOT_FOUND without querying when the user has no scope', async () => {
      resolveScope.execute.mockResolvedValue(null);

      await expect(build().execute({ userId: 5, projectId: 3 })).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.findInScope).not.toHaveBeenCalled();
    });
  });

  describe('ListEventIdsInScopeUC', () => {
    const build = () => new ListEventIdsInScopeUC(repo, resolveScope as any);

    it('lists the events of the scope', async () => {
      await expect(build().execute({ userId: 5 })).resolves.toEqual([4, 8]);
      expect(repo.listEventIdsInScope).toHaveBeenCalledWith(TUTOR_SCOPE);
    });

    it('lists nothing when the user has no scope', async () => {
      resolveScope.execute.mockResolvedValue(null);

      await expect(build().execute({ userId: 5 })).resolves.toEqual([]);
      expect(repo.listEventIdsInScope).not.toHaveBeenCalled();
    });
  });
});

describe('AttachParticipantNamesUC', () => {
  const project = (id: number, userIds: number[]) =>
    ({ id, participants: userIds.map((userId) => ({ userId, projectId: id, studentCode: `c${userId}` })) }) as any;

  it('adds the account name and email of the confirmed participants with one call to auth', async () => {
    const auth = {
      findUsersByIds: jest.fn().mockResolvedValue([
        { id: 7, firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com', status: 'ACTIVE' },
        { id: 8, firstName: 'Eva', email: 'eva@x.com', status: 'ACTIVE' },
      ]),
    };

    const [first, second] = await new AttachParticipantNamesUC(auth as any).execute([project(1, [7, 99]), project(2, [8, 7])]);

    expect(auth.findUsersByIds).toHaveBeenCalledWith([7, 99, 8]);
    expect(first.participants).toEqual([
      { userId: 7, projectId: 1, studentCode: 'c7', firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com' },
      // No account anymore: only the student code
      { userId: 99, projectId: 1, studentCode: 'c99' },
    ]);
    expect(second.participants[0]).toMatchObject({ firstName: 'Eva', lastName: null, email: 'eva@x.com' });
  });

  it('does not call auth when no project has confirmed participants', async () => {
    const auth = { findUsersByIds: jest.fn() };

    await new AttachParticipantNamesUC(auth as any).execute([project(1, [])]);

    expect(auth.findUsersByIds).not.toHaveBeenCalled();
  });
});
