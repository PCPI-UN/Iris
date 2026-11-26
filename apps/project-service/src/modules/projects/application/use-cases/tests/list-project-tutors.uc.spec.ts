import { ListProjectTutorsUC } from '../list-project-tutors.uc';

describe('ListProjectTutorsUC', () => {
  it('lists linked tutors with the name from auth and pending tutors with their email, per project', async () => {
    const repo = {
      listTutorLinksByProjects: jest.fn().mockResolvedValue([
        { projectId: 1, userId: 7 },
        { projectId: 2, userId: 8 },
        { projectId: 2, userId: 99 },
      ]),
      listPendingTutorsByProjects: jest.fn().mockResolvedValue([
        { projectId: 1, firstName: 'Luis', lastName: null, email: 'luis@x.com', status: 'INVITED' },
        { projectId: 1, firstName: 'Joined', email: 'j@x.com', status: 'JOINED' },
      ]),
    };
    const auth = {
      findUsersByIds: jest.fn().mockResolvedValue([
        { id: 7, firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com', status: 'ACTIVE' },
        { id: 8, firstName: 'Eva', email: 'eva@x.com', status: 'ACTIVE' },
      ]),
    };
    const result = await new ListProjectTutorsUC(repo as any, auth as any).execute([1, 2, 3]);

    expect(result.get(1)).toEqual([
      { userId: 7, firstName: 'Ana', lastName: 'Paz', pending: false },
      { firstName: 'Luis', lastName: null, pending: true, email: 'luis@x.com' },
    ]);
    // The tutor with no account in auth (99) and the project without tutors
    expect(result.get(2)).toEqual([{ userId: 8, firstName: 'Eva', lastName: null, pending: false }]);
    expect(result.get(3)).toEqual([]);
    expect(auth.findUsersByIds).toHaveBeenCalledWith([7, 8, 99]);
  });
});
