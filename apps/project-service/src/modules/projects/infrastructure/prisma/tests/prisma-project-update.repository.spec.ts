import { Prisma } from '@prisma/client';
import { PrismaProjectRepository } from '../prisma-project.repository';
import {
  ProjectChangedMeanwhileError,
  ProjectNameTakenError,
} from '../../../domain/admin-project-edit';

describe('PrismaProjectRepository.updateProject', () => {
  const buildDb = () => ({
    project: {
      update: jest.fn().mockResolvedValue({ id: 4, name: 'Dron' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 4, name: 'Dron' }),
    },
  });
  let db: ReturnType<typeof buildDb>;
  let repo: PrismaProjectRepository;

  const uniqueError = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target },
    });

  beforeEach(() => {
    db = buildDb();
    repo = new PrismaProjectRepository({
      db,
    } as unknown as ConstructorParameters<typeof PrismaProjectRepository>[0]);
  });

  it('writes only the fields given and never the state', async () => {
    await repo.updateProject({
      id: 4,
      name: 'Dron',
      eventNumber: null,
      ...({ state: 'REJECTED' } as object),
    });

    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { name: 'Dron', eventNumber: null },
    });
  });

  it('with ifCurrent writes only if the fields still hold the values read', async () => {
    await expect(
      repo.updateProject(
        { id: 4, name: 'Dron', description: 'Nueva', courseId: 5 },
        { name: 'Robot', description: null, courseId: 3 },
      ),
    ).resolves.toEqual({ id: 4, name: 'Dron' });

    expect(db.project.updateMany).toHaveBeenCalledWith({
      where: { name: 'Robot', description: null, courseId: 3, id: 4 },
      data: { name: 'Dron', description: 'Nueva', courseId: 5 },
    });
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it('throws ProjectChangedMeanwhileError when no row still holds the values read', async () => {
    db.project.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repo.updateProject({ id: 4, name: 'Dron' }, { name: 'Robot' }),
    ).rejects.toBeInstanceOf(ProjectChangedMeanwhileError);
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it.each([[['eventId', 'name']], ['projects_event_id_name_key']])(
    'turns the unique index on the name (%p) into ProjectNameTakenError',
    async (target) => {
      db.project.update.mockRejectedValue(uniqueError(target));

      await expect(
        repo.updateProject({ id: 4, name: 'Dron' }),
      ).rejects.toBeInstanceOf(ProjectNameTakenError);
    },
  );

  it('keeps a unique error of another index as it is', async () => {
    const error = uniqueError(['projectCode']);
    db.project.update.mockRejectedValue(error);

    await expect(repo.updateProject({ id: 4, name: 'Dron' })).rejects.toBe(
      error,
    );
  });
});
