import { ListMyEventRolesUC } from '../list-my-event-roles.uc';

function build(asParticipant: number[], asTutor: number[]) {
  const repo = {
    listEventIdsAsParticipant: jest.fn().mockResolvedValue(asParticipant),
    listEventIdsAsTutor: jest.fn().mockResolvedValue(asTutor),
  };
  return { repo, uc: new ListMyEventRolesUC(repo as any) };
}

describe('ListMyEventRolesUC', () => {
  it('returns PARTICIPANT for an event where the user only has a project', async () => {
    expect(await build([1], []).uc.execute(5)).toEqual([
      { eventId: 1, roles: ['PARTICIPANT'] },
    ]);
  });

  it('returns TUTOR for an event where the user only tutors', async () => {
    expect(await build([], [2]).uc.execute(5)).toEqual([
      { eventId: 2, roles: ['TUTOR'] },
    ]);
  });

  it('merges both roles when they fall in the same event', async () => {
    const { uc, repo } = build([1, 3], [3]);
    expect(await uc.execute(5)).toEqual([
      { eventId: 1, roles: ['PARTICIPANT'] },
      { eventId: 3, roles: ['PARTICIPANT', 'TUTOR'] },
    ]);
    expect(repo.listEventIdsAsParticipant).toHaveBeenCalledWith(5);
    expect(repo.listEventIdsAsTutor).toHaveBeenCalledWith(5);
  });

  it('returns an empty list when the user has no project links', async () => {
    expect(await build([], []).uc.execute(5)).toEqual([]);
  });
});
