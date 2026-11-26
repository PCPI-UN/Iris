import {
  buildProjectChangeLogEntry,
  changedFields,
} from '../project-change-log';

describe('buildProjectChangeLogEntry', () => {
  it('keeps only the fields that changed, with the trimmed reason', () => {
    expect(
      buildProjectChangeLogEntry({
        projectId: 5,
        actorUserId: 9,
        action: 'INFO',
        before: { name: 'Viejo', description: 'Igual', projectCode: null },
        after: { name: 'Nuevo', description: 'Igual', projectCode: 'P-1' },
        reason: '  Error de digitación  ',
      }),
    ).toEqual({
      projectId: 5,
      actorUserId: 9,
      action: 'INFO',
      before: { name: 'Viejo', projectCode: null },
      after: { name: 'Nuevo', projectCode: 'P-1' },
      reason: 'Error de digitación',
    });
  });

  it('gives a null reason when none or a blank one is given', () => {
    const base = {
      projectId: 1,
      actorUserId: 2,
      action: 'STATE' as const,
      before: { state: 'APPROVED' },
      after: { state: 'REJECTED' },
    };
    expect(buildProjectChangeLogEntry(base)?.reason).toBeNull();
    expect(
      buildProjectChangeLogEntry({ ...base, reason: '   ' })?.reason,
    ).toBeNull();
  });

  it('returns null when no field changed', () => {
    expect(
      buildProjectChangeLogEntry({
        projectId: 1,
        actorUserId: 2,
        action: 'TUTORS',
        before: { tutorUserIds: [3, 4] },
        after: { tutorUserIds: [3, 4] },
        reason: 'Sin cambios',
      }),
    ).toBeNull();
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

  it('ignores the order of id lists and stores them sorted', () => {
    expect(
      changedFields({ tutorUserIds: [4, 3] }, { tutorUserIds: [3, 4] }),
    ).toEqual({ before: {}, after: {} });
    expect(
      changedFields({ tutorUserIds: [4, 3] }, { tutorUserIds: [5, 3] }),
    ).toEqual({
      before: { tutorUserIds: [3, 4] },
      after: { tutorUserIds: [3, 5] },
    });
  });

  it('keeps the order of lists that are not ids', () => {
    expect(changedFields({ names: ['b', 'a'] }, { names: ['a', 'b'] })).toEqual(
      {
        before: { names: ['b', 'a'] },
        after: { names: ['a', 'b'] },
      },
    );
  });
});
