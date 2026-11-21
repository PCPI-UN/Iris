import {
  ProjectChangeLogService,
  changedFields,
} from '../project-change-log.service';
import { NewProjectChangeLogEntry } from '../../../domain/entities/project-change-log.entity';

describe('ProjectChangeLogService', () => {
  const makeRepo = () => ({
    create: jest
      .fn()
      .mockImplementation((entry: NewProjectChangeLogEntry) =>
        Promise.resolve({ id: 1, createdAt: new Date(), ...entry }),
      ),
    listByProject: jest.fn(),
  });

  it('stores only the fields that changed, with the trimmed reason', async () => {
    const repo = makeRepo();
    const entry = await new ProjectChangeLogService(repo).record({
      projectId: 5,
      actorUserId: 9,
      action: 'INFO',
      before: { name: 'Viejo', description: 'Igual', projectCode: null },
      after: { name: 'Nuevo', description: 'Igual', projectCode: 'P-1' },
      reason: '  Error de digitación  ',
    });

    expect(repo.create).toHaveBeenCalledWith({
      projectId: 5,
      actorUserId: 9,
      action: 'INFO',
      before: { name: 'Viejo', projectCode: null },
      after: { name: 'Nuevo', projectCode: 'P-1' },
      reason: 'Error de digitación',
    });
    expect(entry?.id).toBe(1);
  });

  it('stores a null reason when none or a blank one is given', async () => {
    const repo = makeRepo();
    const service = new ProjectChangeLogService(repo);
    await service.record({
      projectId: 1,
      actorUserId: 2,
      action: 'STATE',
      before: { state: 'APPROVED' },
      after: { state: 'REJECTED' },
    });
    await service.record({
      projectId: 1,
      actorUserId: 2,
      action: 'STATE',
      before: { state: 'REJECTED' },
      after: { state: 'APPROVED' },
      reason: '   ',
    });

    const calls = repo.create.mock.calls as [NewProjectChangeLogEntry][];
    expect(calls.map(([entry]) => entry.reason)).toEqual([null, null]);
  });

  it('writes nothing and returns null when no field changed', async () => {
    const repo = makeRepo();
    const entry = await new ProjectChangeLogService(repo).record({
      projectId: 1,
      actorUserId: 2,
      action: 'TUTORS',
      before: { tutorUserIds: [3, 4] },
      after: { tutorUserIds: [3, 4] },
      reason: 'Sin cambios',
    });

    expect(entry).toBeNull();
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('changedFields', () => {
  it('compares nested values as JSON and treats a missing field as null', () => {
    expect(
      changedFields(
        { tutors: [{ id: 1 }], categoryId: 3, removed: 'x' },
        { tutors: [{ id: 1 }, { id: 2 }], categoryId: 3, added: 'y' },
      ),
    ).toEqual({
      before: { tutors: [{ id: 1 }], removed: 'x', added: null },
      after: { tutors: [{ id: 1 }, { id: 2 }], removed: null, added: 'y' },
    });
  });
});
