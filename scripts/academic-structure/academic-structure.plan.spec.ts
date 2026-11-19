import { buildPlan, emailsOf, Lookups } from './academic-structure.plan';

const lookups = (overrides: Partial<Lookups> = {}): Lookups => ({
  users: new Map([
    ['dir@x.edu', { id: 8, email: 'dir@x.edu', roles: ['DepartmentDirector'] }],
    ['prof@x.edu', { id: 9, email: 'prof@x.edu', roles: ['Professor'] }],
    ['plain@x.edu', { id: 3, email: 'plain@x.edu', roles: ['User'] }],
  ]),
  // 2026-10 is term 3, 2025-10 is term 1
  terms: new Map([['2026/10', 3], ['2025/10', 1]]),
  projectEvents: new Map([[12, 4], [15, 4]]),
  eventTerms: new Map([[4, 3]]),
  eventRequiresCourse: new Map([[4, true]]),
  existingDirectors: new Map(),
  existingCourses: new Set(),
  ...overrides,
});

const course = (extra: Record<string, unknown> = {}) => ({
  year: 2026, period: '10', nrc: '1001', name: 'PF', professorEmail: 'prof@x.edu', department: 'Sistemas', ...extra,
});

describe('buildPlan', () => {
  it('turns emails into user ids and keeps the projects of known course sections', () => {
    const plan = buildPlan(
      {
        departments: [{ name: ' Sistemas ', directorEmail: 'DIR@x.edu' }, { name: 'Industrial' }],
        courses: [course()],
        projects: [{ projectId: 12, year: 2026, period: '10', nrc: '1001' }],
      },
      lookups(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.departments).toEqual([
      { name: 'Sistemas', directorUserId: 8 },
      { name: 'Industrial', directorUserId: null },
    ]);
    expect(plan.courses).toEqual([{ termId: 3, nrc: '1001', name: 'PF', professorUserId: 9, department: 'Sistemas' }]);
    expect(plan.projects).toEqual([{ projectId: 12, termId: 3, nrc: '1001' }]);
  });

  it('accepts departments and course sections that are already in the database', () => {
    const plan = buildPlan(
      { courses: [course()], projects: [{ projectId: 15, year: 2025, period: '10', nrc: '9' }] },
      lookups({
        existingDirectors: new Map([['Sistemas', null]]),
        existingCourses: new Set(['1/9']),
        eventTerms: new Map([[4, 1]]),
      }),
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
        departments: [
          { name: '' },
          { name: 'Sistemas', directorEmail: 'nobody@x.edu' },
          { name: 'Sistemas' },
          { name: 'Sin departamento' },
        ],
        courses: [
          course(),
          course({ name: 'again' }),
          course({ nrc: '2', department: 'Química' }),
          course({ nrc: '3', professorEmail: '' }),
          course({ nrc: '4', year: 2030 }),
          course({ nrc: '5', year: undefined }),
        ],
        projects: [
          { projectId: 99, year: 2026, period: '10', nrc: '1001' },
          { projectId: 12, year: 2026, period: '10', nrc: '777' },
          { projectId: 15, year: 2026, period: '10', nrc: '1001' },
          { projectId: 15, year: 2026, period: '10', nrc: '1001' },
        ] as any,
      },
      lookups(),
    );

    expect(plan.errors).toEqual([
      'departments[0]: name is required',
      'departments[1]: no user with email nobody@x.edu',
      'departments[2]: department "Sistemas" is repeated',
      'departments[3]: "Sin departamento" is reserved for the projects created before course sections existed',
      'courses[1]: NRC 1001 of term 202610 is repeated',
      'courses[2]: department "Química" is neither in the file nor in the database',
      'courses[3]: professorEmail required',
      'courses[4]: term 203010 does not exist; create it first (POST /terms)',
      'courses[5]: year required',
      'projects[0]: project 99 does not exist',
      'projects[1]: NRC 777 of term 202610 is neither in the file nor in the database',
      'projects[3]: project 15 is repeated',
    ]);
  });

  it('links a project only to a course section of the term of its event', () => {
    const plan = buildPlan(
      {
        courses: [course(), course({ year: 2025 })],
        projects: [
          { projectId: 12, year: 2025, period: '10', nrc: '1001' },
          { projectId: 15, year: 2026, period: '10', nrc: '1001' },
        ],
      },
      // Event 4 (project 12) is in term 3 = 202610; event 5 (project 15) still has no term
      lookups({
        projectEvents: new Map([[12, 4], [15, 5]]),
        eventTerms: new Map([[4, 3], [5, -1]]),
        existingDirectors: new Map([['Sistemas', null]]),
      }),
    );

    expect(plan.errors).toEqual([
      'projects[0]: event 4 of project 12 is not in term 202510; set the term of the event first (PATCH /events/4)',
      'projects[1]: event 5 of project 15 is not in term 202610; set the term of the event first (PATCH /events/5)',
    ]);
  });

  it('does not link a project of an event that does not require a course section', () => {
    const plan = buildPlan(
      { courses: [course()], projects: [{ projectId: 12, year: 2026, period: '10', nrc: '1001' }] },
      lookups({ eventRequiresCourse: new Map([[4, false]]), existingDirectors: new Map([['Sistemas', null]]) }),
    );

    expect(plan.errors).toEqual([
      'projects[0]: event 4 of project 12 does not require a course section; its projects keep course section 0',
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

describe('buildPlan: director of a department', () => {
  const existing = lookups({ existingDirectors: new Map([['Sistemas', 8]]) });

  it('keeps the current director when directorEmail is omitted', () => {
    const plan = buildPlan({ departments: [{ name: 'Sistemas' }], courses: [course({ nrc: '2' })] }, existing);

    expect(plan.errors).toEqual([]);
    expect(plan.departments).toEqual([{ name: 'Sistemas', directorUserId: 8 }]);
  });

  it('removes the director when directorEmail is null', () => {
    const plan = buildPlan({ departments: [{ name: 'Sistemas', directorEmail: null }] }, existing);

    expect(plan.departments).toEqual([{ name: 'Sistemas', directorUserId: null }]);
  });

  it('a new department without directorEmail has no director', () => {
    const plan = buildPlan({ departments: [{ name: 'Industrial' }] }, existing);

    expect(plan.departments).toEqual([{ name: 'Industrial', directorUserId: null }]);
  });

  it('a kept director still counts for "one department per director"', () => {
    const plan = buildPlan(
      { departments: [{ name: 'Sistemas' }, { name: 'Industrial', directorEmail: 'dir@x.edu' }] },
      existing,
    );

    expect(plan.errors).toEqual([
      'Department "Industrial": its director already directs "Sistemas"; a user directs one department',
    ]);
  });

  it('rejects an empty directorEmail instead of guessing', () => {
    const plan = buildPlan({ departments: [{ name: 'Sistemas', directorEmail: ' ' }] }, existing);

    expect(plan.errors).toEqual([
      'departments[0]: directorEmail must be an email, or null to leave the department without director',
    ]);
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
