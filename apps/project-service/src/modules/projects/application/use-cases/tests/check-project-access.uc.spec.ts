import { CheckProjectAccessUC } from '../check-project-access.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { AuthServicePort, UserPlatformAccess } from '../../ports/auth-service.port';
import { ForbiddenError, NotFoundError } from '../../../domain/errors';
import { JUROR_ROLE_ID } from '../../../domain/entities/project.entity';

const PROJECT = 1;
const STUDENT = 10; // confirmed participant
const JUROR = 20; // assigned juror
const OTHER = 30; // signed in, unrelated
const STAFF_READ = 40; // dean: read:events
const STAFF_EDIT = 50; // event manager: manage:events
const ADMIN = 60;
const DOCUMENT = 7;

const ACCESS: Record<number, UserPlatformAccess> = {
  [STAFF_READ]: { roleNames: ['Dean'], permissions: ['read:events', 'read:grades'] },
  [STAFF_EDIT]: { roleNames: ['EventManager'], permissions: ['read:events', 'manage:events'] },
  [ADMIN]: { roleNames: ['Admin'], permissions: [] },
};

function build() {
  const repo = {
    findById: jest.fn(async (id: number) => (id === PROJECT ? { id: PROJECT } : null)),
    findDocumentById: jest.fn(async (id: number) =>
      id === DOCUMENT ? { id: DOCUMENT, projectId: PROJECT } : null,
    ),
    isUserParticipant: jest.fn(async (projectId: number, userId: number) => projectId === PROJECT && userId === STUDENT),
    listAssignments: jest.fn(async () => [
      { memberUserId: JUROR, memberEventId: 3, memberRoleId: JUROR_ROLE_ID },
      // a non-juror row must not grant access
      { memberUserId: OTHER, memberEventId: 3, memberRoleId: 5 },
    ]),
  };
  const auth = {
    getUserPlatformAccess: jest.fn(async (userId: number) => ACCESS[userId] ?? { roleNames: ['User'], permissions: [] }),
  };
  const useCase = new CheckProjectAccessUC(
    repo as unknown as ProjectRepository,
    auth as unknown as AuthServicePort,
  );
  return { useCase, repo, auth };
}

describe('CheckProjectAccessUC', () => {
  const { useCase } = build();
  const read = (userId: number) => useCase.execute({ userId, action: 'READ', projectId: PROJECT });
  const edit = (userId: number) => useCase.execute({ userId, action: 'EDIT', projectId: PROJECT });

  it.each([STUDENT, JUROR, STAFF_READ, STAFF_EDIT, ADMIN])('lets user %i read the project', async (userId) => {
    await expect(read(userId)).resolves.toEqual({ projectId: PROJECT });
  });

  it('does not let an unrelated user read the project', async () => {
    await expect(read(OTHER)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each([STUDENT, STAFF_EDIT, ADMIN])('lets user %i edit the project', async (userId) => {
    await expect(edit(userId)).resolves.toEqual({ projectId: PROJECT });
  });

  it.each([JUROR, STAFF_READ, OTHER])('does not let user %i edit the project', async (userId) => {
    await expect(edit(userId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('checks the project of a document', async () => {
    await expect(
      useCase.execute({ userId: STUDENT, action: 'EDIT', documentId: DOCUMENT }),
    ).resolves.toEqual({ projectId: PROJECT });
    await expect(
      useCase.execute({ userId: OTHER, action: 'EDIT', documentId: DOCUMENT }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('answers not found for a missing project or document', async () => {
    await expect(useCase.execute({ userId: STUDENT, action: 'READ', projectId: 999 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCase.execute({ userId: STUDENT, action: 'EDIT', documentId: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not ask auth-service when the caller is a participant', async () => {
    const { useCase: fresh, auth } = build();
    await fresh.execute({ userId: STUDENT, action: 'EDIT', projectId: PROJECT });
    expect(auth.getUserPlatformAccess).not.toHaveBeenCalled();
  });
});
