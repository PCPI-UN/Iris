import { PrismaProjectRepository, scopeWhere } from '../prisma-project.repository';

const scope = (relations: Partial<{ asTutor: boolean; asProfessor: boolean; asDirector: boolean }>) => ({
  all: false as const, userId: 5, asTutor: false, asProfessor: false, asDirector: false, ...relations,
});

const TUTORED = { tutors: { some: { userId: 5 } } };
const TAUGHT = { academicCourse: { is: { professorUserId: 5 } } };
const DIRECTED = { academicCourse: { is: { department: { is: { directorUserId: 5 } } } } };

describe('scopeWhere', () => {
  it('has no filter for a read-all scope', () => {
    expect(scopeWhere({ all: true })).toBeUndefined();
  });

  it.each([
    ['tutor', { asTutor: true }, [TUTORED]],
    ['professor', { asProfessor: true }, [TAUGHT]],
    ['director', { asDirector: true }, [DIRECTED]],
    ['every relation, OR-ed', { asTutor: true, asProfessor: true, asDirector: true }, [TUTORED, TAUGHT, DIRECTED]],
  ])('%s', (_name, relations, or) => {
    expect(scopeWhere(scope(relations))).toEqual({ OR: or });
  });

  it('a scope with no relation matches nothing', () => {
    expect(scopeWhere(scope({}))).toEqual({ OR: [{ id: -1 }] });
  });
});

describe('PrismaProjectRepository (read scope)', () => {
  const row = {
    id: 3,
    eventId: 4,
    name: 'EcoVision',
    academicCourseId: 2,
    academicCourse: {
      id: 2, nrc: '1234', term: '202610', name: 'Proyecto Final', professorUserId: 9, departmentId: 1,
      department: { name: 'Sistemas' },
    },
  };
  let prisma: any;
  let repo: PrismaProjectRepository;

  beforeEach(() => {
    prisma = {
      project: {
        findMany: jest.fn((args) => ({ op: 'findMany', args })),
        count: jest.fn((args) => ({ op: 'count', args })),
        findFirst: jest.fn().mockResolvedValue(row),
      },
      $transaction: jest.fn().mockResolvedValue([[row, { ...row, id: 4, academicCourseId: null, academicCourse: null }], 2]),
    };
    repo = new PrismaProjectRepository(prisma);
  });

  it('listInScope ANDs the scope with the filters and maps the course section', async () => {
    const result = await repo.listInScope(scope({ asTutor: true }), {
      eventId: 4, state: 'APPROVED', academicCourseId: 2, q: 'eco', currentPage: 2, itemsPerPage: 10,
    });

    const where = {
      AND: [
        { OR: [TUTORED] },
        { eventId: 4 },
        { state: 'APPROVED' },
        { academicCourseId: 2 },
        { name: { contains: 'eco', mode: 'insensitive' } },
      ],
    };
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 }));
    expect(prisma.project.count).toHaveBeenCalledWith({ where });
    expect(result.total).toBe(2);
    expect(result.items[0].academicCourse).toEqual({
      id: 2, nrc: '1234', term: '202610', name: 'Proyecto Final', professorUserId: 9, departmentId: 1, departmentName: 'Sistemas',
    });
    expect(result.items[1].academicCourse).toBeNull();
  });

  it('listInScope with a read-all scope and no filters has an empty AND', async () => {
    await repo.listInScope({ all: true }, { currentPage: 1, itemsPerPage: 10 });

    expect(prisma.project.count).toHaveBeenCalledWith({ where: { AND: [] } });
  });

  it('findInScope looks the project up inside the scope', async () => {
    const project = await repo.findInScope(scope({ asDirector: true }), 3);

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ id: 3 }, { OR: [DIRECTED] }] } }),
    );
    expect(project?.academicCourse?.departmentName).toBe('Sistemas');
  });

  it('findInScope returns null when no project matches', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(repo.findInScope({ all: true }, 3)).resolves.toBeNull();
    expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ id: 3 }] } }));
  });

  it('listEventIdsInScope returns the distinct event ids of the scope', async () => {
    prisma.project.findMany = jest.fn().mockResolvedValue([{ eventId: 4 }, { eventId: 8 }]);

    await expect(repo.listEventIdsInScope(scope({ asProfessor: true }))).resolves.toEqual([4, 8]);
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { OR: [TAUGHT] },
      distinct: ['eventId'],
      select: { eventId: true },
      orderBy: { eventId: 'asc' },
    });
  });
});
