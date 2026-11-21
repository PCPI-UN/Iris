import { PrismaProjectRepository, scopeWhere } from '../prisma-project.repository';

const scope = (relations: Partial<{ tutored: boolean; ofCourses: boolean; ofDepartment: boolean }>) => ({
  all: false as const, userId: 5, tutored: false, ofCourses: false, ofDepartment: false, ...relations,
});

const TUTORED = { tutors: { some: { userId: 5 } } };
const TAUGHT = { academicCourse: { is: { professorUserId: 5 } } };
const DIRECTED = { academicCourse: { is: { department: { is: { directorUserId: 5 } } } } };

describe('scopeWhere', () => {
  it('has no filter for a read-all scope', () => {
    expect(scopeWhere({ all: true })).toBeUndefined();
  });

  it.each([
    ['tutor', { tutored: true }, [TUTORED]],
    ['professor', { ofCourses: true }, [TAUGHT]],
    ['director', { ofDepartment: true }, [DIRECTED]],
    ['every relation, OR-ed', { tutored: true, ofCourses: true, ofDepartment: true }, [TUTORED, TAUGHT, DIRECTED]],
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
    _count: { jurorsAssigned: 3 },
    academicCourse: {
      id: 2, nrc: '1234', termId: 3, name: 'Proyecto Final', professorUserId: 9, departmentId: 1,
      department: { name: 'Sistemas' },
    },
  };
  let prisma: any;
  let repo: PrismaProjectRepository;

  beforeEach(() => {
    prisma = {
      db: {
        project: {
          // Project 4 is still in course section -1 (created before course sections existed)
          findMany: jest.fn().mockResolvedValue([row, {
            ...row,
            id: 4,
            academicCourseId: -1,
            academicCourse: { id: -1, nrc: '-1', termId: -1, name: 'Sin NRC', professorUserId: 0, departmentId: -1, department: { name: 'Sin departamento' } },
          }, {
            ...row,
            id: 5,
            academicCourseId: 0,
            academicCourse: { id: 0, nrc: '0', termId: -1, name: 'No aplica', professorUserId: 0, departmentId: -1, department: { name: 'Sin departamento' } },
          }]),
          count: jest.fn().mockResolvedValue(3),
          findFirst: jest.fn().mockResolvedValue(row),
        },
      },
    };
    repo = new PrismaProjectRepository(prisma);
  });

  it('listInScope ANDs the scope with the filters and maps the course section, hiding course sections -1 and 0', async () => {
    const result = await repo.listInScope(scope({ tutored: true }), {
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
    expect(prisma.db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 }));
    expect(prisma.db.project.count).toHaveBeenCalledWith({ where });
    expect(result.total).toBe(3);
    expect(result.items[0].academicCourse).toEqual({
      id: 2, nrc: '1234', termId: 3, name: 'Proyecto Final', professorUserId: 9, departmentId: 1, departmentName: 'Sistemas',
    });
    expect(result.items[1].academicCourse).toBeNull();
    expect(result.items[1].academicCourseId).toBe(-1);
    expect(result.items[2].academicCourse).toBeNull();
    expect(result.items[2].academicCourseId).toBe(0);
    expect(result.items[0].assignedJurorCount).toBe(3);
    expect(result.items[0]).not.toHaveProperty('_count');
    expect(result.items[1].assignedJurorCount).toBe(3);
  });

  it('listInScope with a read-all scope and no filters has an empty AND', async () => {
    await repo.listInScope({ all: true }, { currentPage: 1, itemsPerPage: 10 });

    expect(prisma.db.project.count).toHaveBeenCalledWith({ where: { AND: [] } });
  });

  it('findInScope looks the project up inside the scope', async () => {
    const project = await repo.findInScope(scope({ ofDepartment: true }), 3);

    expect(prisma.db.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ id: 3 }, { OR: [DIRECTED] }] } }),
    );
    expect(project?.academicCourse?.departmentName).toBe('Sistemas');
  });

  it('findInScope returns null when no project matches', async () => {
    prisma.db.project.findFirst.mockResolvedValue(null);

    await expect(repo.findInScope({ all: true }, 3)).resolves.toBeNull();
    expect(prisma.db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ id: 3 }] } }));
  });

  it('listEventIdsInScope returns the distinct event ids of the scope', async () => {
    prisma.db.project.findMany = jest.fn().mockResolvedValue([{ eventId: 4 }, { eventId: 8 }]);

    await expect(repo.listEventIdsInScope(scope({ ofCourses: true }))).resolves.toEqual([4, 8]);
    expect(prisma.db.project.findMany).toHaveBeenCalledWith({
      where: { OR: [TAUGHT] },
      distinct: ['eventId'],
      select: { eventId: true },
      orderBy: { eventId: 'asc' },
    });
  });

  it('findAcademicCourseId looks the course section up by term and NRC', async () => {
    prisma.db.academicCourse = { findUnique: jest.fn().mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce(null) };

    await expect(repo.findAcademicCourseId(3, '1234')).resolves.toBe(2);
    expect(prisma.db.academicCourse.findUnique).toHaveBeenCalledWith({
      where: { termId_nrc: { termId: 3, nrc: '1234' } },
      select: { id: true },
    });
    await expect(repo.findAcademicCourseId(3, '9999')).resolves.toBeNull();
  });
});
