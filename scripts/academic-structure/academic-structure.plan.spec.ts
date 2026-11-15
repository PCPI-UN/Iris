import { buildPlan, emailsOf, Lookups } from './academic-structure.plan';

const lookups = (overrides: Partial<Lookups> = {}): Lookups => ({
  users: new Map([
    ['dir@x.edu', { id: 8, email: 'dir@x.edu', roles: ['DepartmentDirector'] }],
    ['prof@x.edu', { id: 9, email: 'prof@x.edu', roles: ['Professor'] }],
    ['plain@x.edu', { id: 3, email: 'plain@x.edu', roles: ['User'] }],
  ]),
  projectIds: new Set([12, 15]),
  existingDirectors: new Map(),
  existingCourses: new Set(),
  ...overrides,
});

const course = (extra: Record<string, unknown> = {}) => ({
  term: '202610', nrc: '1001', name: 'PF', professorEmail: 'prof@x.edu', department: 'Sistemas', ...extra,
});

describe('buildPlan', () => {
  it('turns emails into user ids and keeps the projects of known course sections', () => {
    const plan = buildPlan(
      {
        departments: [{ name: ' Sistemas ', directorEmail: 'DIR@x.edu' }, { name: 'Industrial' }],
        courses: [course()],
        projects: [{ projectId: 12, term: '202610', nrc: '1001' }],
      },
      lookups(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.departments).toEqual([
      { name: 'Sistemas', directorUserId: 8 },
      { name: 'Industrial', directorUserId: null },
    ]);
    expect(plan.courses).toEqual([{ term: '202610', nrc: '1001', name: 'PF', professorUserId: 9, department: 'Sistemas' }]);
    expect(plan.projects).toEqual([{ projectId: 12, term: '202610', nrc: '1001' }]);
  });

  it('accepts departments and course sections that are already in the database', () => {
    const plan = buildPlan(
      { courses: [course()], projects: [{ projectId: 15, term: '202510', nrc: '9' }] },
      lookups({ existingDirectors: new Map([['Sistemas', null]]), existingCourses: new Set(['202510/9']) }),
    );

    expect(plan.errors).toEqual([]);
  });

  it('warns when the user lacks the role that makes the data visible', () => {
    const plan = buildPlan(
      { departments: [{ name: 'Sistemas', directorEmail: 'plain@x.edu' }], courses: [course({ professorEmail: 'plain@x.edu' })] },
      lookups(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toHaveLength(2);
    expect(plan.warnings[0]).toContain('DepartmentDirector');
    expect(plan.warnings[1]).toContain('Professor');
  });

  it('reports every problem of the file', () => {
    const plan = buildPlan(
      {
        departments: [{ name: '' }, { name: 'Sistemas', directorEmail: 'nobody@x.edu' }, { name: 'Sistemas' }],
        courses: [
          course(),
          course({ name: 'again' }),
          course({ nrc: '2', department: 'Química' }),
          course({ nrc: '3', professorEmail: '' }),
        ],
        projects: [
          { projectId: 99, term: '202610', nrc: '1001' },
          { projectId: 12, term: '202610', nrc: '777' },
          { projectId: 15, term: '202610', nrc: '1001' },
          { projectId: 15, term: '202610', nrc: '1001' },
        ],
      },
      lookups(),
    );

    expect(plan.errors).toEqual([
      'departments[0]: name is required',
      'departments[1]: no user with email nobody@x.edu',
      'departments[2]: department "Sistemas" is repeated',
      'courses[1]: NRC 1001 of term 202610 is repeated',
      'courses[2]: department "Química" is neither in the file nor in the database',
      'courses[3]: professorEmail required',
      'projects[0]: project 99 does not exist',
      'projects[1]: NRC 777 of term 202610 is neither in the file nor in the database',
      'projects[3]: project 15 is repeated',
    ]);
  });

  it('keeps one department per director, counting the departments of the database', () => {
    const inFile = buildPlan(
      { departments: [{ name: 'A', directorEmail: 'dir@x.edu' }, { name: 'B', directorEmail: 'dir@x.edu' }] },
      lookups(),
    );
    expect(inFile.errors).toEqual(['Department "B": its director already directs "A"; a user directs one department']);

    const inDatabase = buildPlan(
      { departments: [{ name: 'B', directorEmail: 'dir@x.edu' }] },
      lookups({ existingDirectors: new Map([['A', 8]]) }),
    );
    expect(inDatabase.errors).toEqual(['Department "B": its director already directs "A"; a user directs one department']);

    // Moving the director between two departments of the same file is fine
    const moved = buildPlan(
      { departments: [{ name: 'A', directorEmail: null }, { name: 'B', directorEmail: 'dir@x.edu' }] },
      lookups({ existingDirectors: new Map([['A', 8]]) }),
    );
    expect(moved.errors).toEqual([]);
  });
});

describe('emailsOf', () => {
  it('lists each email of the file once, lower-cased', () => {
    expect(
      emailsOf({
        departments: [{ name: 'A', directorEmail: 'Dir@x.edu' }, { name: 'B' }],
        courses: [course(), course({ nrc: '2', professorEmail: 'PROF@x.edu' })],
      }),
    ).toEqual(['dir@x.edu', 'prof@x.edu']);
  });
});
