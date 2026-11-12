import { AddProjectTutorUC } from '../add-project-tutor.uc';
import { NotFoundError, ValidationError } from '../../../domain/errors';

describe('AddProjectTutorUC', () => {
  let repo: {
    findById: jest.Mock;
    listPendingTutors: jest.Mock;
    listTutorUserIds: jest.Mock;
    addTutor: jest.Mock;
    markPendingTutorJoined: jest.Mock;
  };
  let uc: AddProjectTutorUC;
  const input = { projectId: 3, userId: 7, email: ' Tutor@Example.com ' };

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue({ id: 3 }),
      listPendingTutors: jest
        .fn()
        .mockResolvedValue([{ email: 'tutor@example.com', status: 'INVITED' }]),
      listTutorUserIds: jest.fn().mockResolvedValue([]),
      addTutor: jest.fn().mockResolvedValue(undefined),
      markPendingTutorJoined: jest.fn().mockResolvedValue(true),
    };
    uc = new AddProjectTutorUC(repo as any);
  });

  it('links the tutor and marks the pending tutor with that email as joined', async () => {
    await expect(uc.execute(input)).resolves.toEqual({ success: true });

    expect(repo.addTutor).toHaveBeenCalledWith(3, 7);
    expect(repo.markPendingTutorJoined).toHaveBeenCalledWith(
      3,
      'tutor@example.com',
      expect.any(Date),
    );
  });

  it('rejects the link when the tutor was removed from the project after the invitation', async () => {
    repo.listPendingTutors.mockResolvedValue([]);

    await expect(uc.execute(input)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.addTutor).not.toHaveBeenCalled();
  });

  it('succeeds without changes when a retried acceptance finds the tutor already linked', async () => {
    repo.listPendingTutors.mockResolvedValue([{ email: 'tutor@example.com', status: 'JOINED' }]);
    repo.listTutorUserIds.mockResolvedValue([7]);

    await expect(uc.execute(input)).resolves.toEqual({ success: true });
    expect(repo.addTutor).not.toHaveBeenCalled();
    expect(repo.markPendingTutorJoined).not.toHaveBeenCalled();
  });

  it.each([
    ['projectId', { ...input, projectId: 0 }],
    ['userId', { ...input, userId: 0 }],
    ['email', { ...input, email: 'not-an-email' }],
  ])('rejects an invalid %s without touching the repository', async (_, bad) => {
    await expect(uc.execute(bad)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.addTutor).not.toHaveBeenCalled();
  });

  it('fails with NotFoundError when the project does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(uc.execute(input)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.addTutor).not.toHaveBeenCalled();
  });
});
