import { PrismaProjectRepository } from '../prisma-project.repository';

describe('PrismaProjectRepository documents', () => {
  const ACTIVE_ONLY = { where: { state: 'ACTIVE' } };
  /** `include.documents` of the first call of a findMany/findFirst mock */
  const documentsOf = (mock: jest.Mock) =>
    (mock.mock.calls[0] as [{ include: { documents: unknown } }])[0].include
      .documents;

  const buildDb = () => ({
    projectDocument: { findMany: jest.fn().mockResolvedValue([]) },
    project: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
  });
  let db: ReturnType<typeof buildDb>;
  let repo: PrismaProjectRepository;

  beforeEach(() => {
    db = buildDb();
    repo = new PrismaProjectRepository({
      db,
    } as unknown as ConstructorParameters<typeof PrismaProjectRepository>[0]);
  });

  it('listDocuments leaves out the INACTIVE documents', async () => {
    await repo.listDocuments(4);

    expect(db.projectDocument.findMany).toHaveBeenCalledWith({
      where: { projectId: 4, state: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('listDocuments with includeInactive lists every document', async () => {
    await repo.listDocuments(4, { includeInactive: true });

    expect(db.projectDocument.findMany).toHaveBeenCalledWith({
      where: { projectId: 4 },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('the public listing by event loads only ACTIVE documents', async () => {
    await repo.listByFilter(9);

    expect(documentsOf(db.project.findMany)).toEqual(ACTIVE_ONLY);
  });

  it("a juror's assigned projects load only ACTIVE documents", async () => {
    await repo.listAssignedToJuror({
      memberUserId: 1,
      memberEventId: 9,
      memberRoleId: 4,
    });

    expect(documentsOf(db.project.findMany)).toEqual(ACTIVE_ONLY);
  });

  it('the academic reads load only ACTIVE documents', async () => {
    await repo.findInScope({ all: true }, 4);

    expect(documentsOf(db.project.findFirst)).toEqual(ACTIVE_ONLY);
  });
});
