import { ListProjectChangeLogUC } from '../list-project-change-log.uc';
import { NotFoundError } from '../../../domain/errors';

describe('ListProjectChangeLogUC', () => {
  it('returns the entries of the project as the repository orders them (most recent first)', async () => {
    const entries = [
      {
        id: 2,
        projectId: 4,
        actorUserId: 1,
        action: 'STATE',
        before: { state: 'APPROVED' },
        after: { state: 'REJECTED' },
        reason: 'Plagio',
        createdAt: new Date('2026-11-20T10:00:00Z'),
      },
      {
        id: 1,
        projectId: 4,
        actorUserId: 1,
        action: 'INFO',
        before: { name: 'A' },
        after: { name: 'B' },
        reason: null,
        createdAt: new Date('2026-11-19T10:00:00Z'),
      },
    ];
    const projects = { findById: jest.fn().mockResolvedValue({ id: 4 }) };
    const changeLog = { listByProject: jest.fn().mockResolvedValue(entries) };

    const result = await new ListProjectChangeLogUC(
      projects as any,
      changeLog as any,
    ).execute(4);

    expect(result).toEqual(entries);
    expect(changeLog.listByProject).toHaveBeenCalledWith(4);
  });

  it('returns an empty list for a project without changes', async () => {
    const projects = { findById: jest.fn().mockResolvedValue({ id: 4 }) };
    const changeLog = { listByProject: jest.fn().mockResolvedValue([]) };

    await expect(
      new ListProjectChangeLogUC(projects as any, changeLog as any).execute(4),
    ).resolves.toEqual([]);
  });

  it('fails with a NotFoundError in Spanish when the project does not exist', async () => {
    const projects = { findById: jest.fn().mockResolvedValue(null) };
    const changeLog = { listByProject: jest.fn() };

    const result = new ListProjectChangeLogUC(
      projects as any,
      changeLog as any,
    ).execute(99);

    await expect(result).rejects.toBeInstanceOf(NotFoundError);
    await expect(result).rejects.toThrow('No se encontró el proyecto');
    expect(changeLog.listByProject).not.toHaveBeenCalled();
  });
});
