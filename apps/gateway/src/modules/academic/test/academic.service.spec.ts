import { NotFoundException } from '@nestjs/common';
import { ProjectState } from '@app/common/generated/project';
import {
  AcademicService,
  canReadUnpublishedGrades,
  toGradeStatus,
  toRegistrationProject,
  withoutOneofMarkers,
  studentNames,
  byCourseThenName,
} from '../academic.service';

const user = (roles: string[], permissions: string[] = []) =>
  ({
    id: 5,
    platformRoles: roles.map((name, i) => ({ id: i + 1, name, scope: 'PLATFORM' })),
    platformPermissions: permissions,
  }) as any;

const PROFESSOR = user(['Professor'], ['read:academic_projects']);
const DEAN = user(['Dean'], ['read:academic_projects', 'read:grades']);

const course = { id: 2, nrc: '1001', termId: 3, name: 'PF Sistemas', professorUserId: 5, departmentId: 1, departmentName: 'Sistemas' };

const project = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `P${id}`,
  projectCode: `C${id}`,
  state: 'APPROVED',
  participants: [],
  pendingParticipants: [],
  documents: [],
  tutors: [],
  academicCourse: course,
  assignedJurorCount: 3,
  ...extra,
});

describe('AcademicService', () => {
  let projectsService: any;
  let eventsService: any;
  let evaluationsService: any;
  let service: AcademicService;

  beforeEach(() => {
    projectsService = {
      listProjectsInScope: jest.fn().mockResolvedValue({ items: [] }),
      getProjectInScope: jest.fn().mockResolvedValue(project(1)),
      listEventIdsInScope: jest.fn().mockResolvedValue([4, 8, 9]),
      // 1: two of three jurors evaluated; 2: nobody evaluated yet
      listAllProjectsInScope: jest.fn().mockResolvedValue([project(1), project(2)]),
    };
    eventsService = {
      listTerms: jest.fn().mockResolvedValue([{ id: 3, year: 2026, period: '10' }]),
      getEventById: jest.fn().mockResolvedValue({ id: 4, name: 'Feria 2026', resultsPublished: false, active: true }),
      listEventsByIds: jest.fn().mockResolvedValue([
        // newest first, as event-service returns them
        { id: 9, name: 'Deleted', startDate: '2026-06-01', resultsPublished: false, active: false },
        { id: 8, name: 'New', startDate: '2026-05-01', resultsPublished: false, active: true },
        { id: 4, name: 'Old', startDate: '2025-05-01', resultsPublished: true, active: true },
      ]),
    };
    evaluationsService = {
      getAverageGrades: jest.fn().mockResolvedValue([{ projectId: 1, averageGrade: 4.25, evaluationCount: 2 }]),
    };
    service = new AcademicService(projectsService, eventsService, evaluationsService);
  });

  describe('getGrades', () => {
    it('hides unpublished grades from a professor but shows the status and the counters', async () => {
      const report = await service.getGrades(PROFESSOR, 4);

      expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({ userId: 5, eventId: 4, state: ProjectState.APPROVED });
      expect(report).toMatchObject({ resultsPublished: false, gradeVisibility: 'PUBLISHED_ONLY' });
      expect(report.projects).toEqual([
        expect.objectContaining({
          projectId: 1, gradeStatus: 'PRELIMINARY', finalScore: null, gradeHidden: true,
          assignedJurors: 3, completedEvaluations: 2, pendingEvaluations: 1,
        }),
        expect.objectContaining({
          projectId: 2, gradeStatus: 'PENDING', finalScore: null, gradeHidden: false,
          completedEvaluations: 0, pendingEvaluations: 3,
        }),
      ]);
      // The grade value is nowhere in the response
      expect(JSON.stringify(report)).not.toContain('4.25');
    });

    it('shows preliminary grades to the dean before publication', async () => {
      const report = await service.getGrades(DEAN, 4);

      expect(report.gradeVisibility).toBe('ALL');
      expect(report.projects[0]).toMatchObject({ gradeStatus: 'PRELIMINARY', finalScore: 4.25, gradeHidden: false });
    });

    it('Admin sees unpublished grades through its role, like every other check', async () => {
      const report = await service.getGrades(user(['Admin']), 4);

      expect(report.projects[0].finalScore).toBe(4.25);
    });

    it('once published every caller sees official grades', async () => {
      eventsService.getEventById.mockResolvedValue({ id: 4, name: 'Feria 2026', resultsPublished: true, active: true });

      const report = await service.getGrades(PROFESSOR, 4);

      expect(report.projects[0]).toMatchObject({ gradeStatus: 'OFFICIAL', finalScore: 4.25, gradeHidden: false });
      expect(report.projects[1]).toMatchObject({ gradeStatus: 'PENDING', finalScore: null });
    });

    it('a missing event is a 404', async () => {
      eventsService.getEventById.mockResolvedValue(undefined);

      await expect(service.getGrades(PROFESSOR, 4)).rejects.toBeInstanceOf(NotFoundException);
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });
  });

  it('listProjects passes the caller and the filters to project-service', async () => {
    await service.listProjects(5, { eventId: 4, state: 'APPROVED' as any, academicCourseId: 2, q: 'eco' });

    expect(projectsService.listProjectsInScope).toHaveBeenCalledWith({
      userId: 5, eventId: 4, state: ProjectState.APPROVED, academicCourseId: 2, q: 'eco', currentPage: 1, itemsPerPage: 10,
    });
  });

  it('listEvents keeps the order of event-service and leaves out the deleted events', async () => {
    const events = await service.listEvents(5);

    expect(eventsService.listEventsByIds).toHaveBeenCalledWith([4, 8, 9]);
    expect(events.map((e) => e.id)).toEqual([8, 4]);
  });

  describe('event of /registrations and /grades', () => {
    const calls = (s: AcademicService) => [
      () => s.getRegistrations(5, 4),
      () => s.getGrades(PROFESSOR, 4),
    ];

    it('an event without projects of the caller is a 404, like /projects/:id outside the scope', async () => {
      projectsService.listEventIdsInScope.mockResolvedValue([8]);

      for (const call of calls(service)) {
        await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(eventsService.getEventById).not.toHaveBeenCalled();
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });

    it('a deleted event is a 404, as it is not in /academic/events', async () => {
      eventsService.getEventById.mockResolvedValue({ id: 4, name: 'Feria 2026', active: false });

      for (const call of calls(service)) {
        await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });
  });

  it('getRegistrations counts projects by state and students', async () => {
    projectsService.listAllProjectsInScope.mockResolvedValue([
      project(1, { participants: [{ userId: 7, studentCode: 'S1', firstName: 'Ana' }] }),
      project(2, { state: 'UNDER_REVIEW', pendingParticipants: [{ studentCode: 'S2', firstName: 'Luis', status: 'PENDING' }] }),
    ]);

    const report = await service.getRegistrations(5, 4);

    expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({ userId: 5, eventId: 4 });
    expect(report.totals).toEqual({
      projects: 2,
      byState: { UNDER_REVIEW: 1, APPROVED: 1, REJECTED: 0, REQUEST_CHANGES: 0 },
      confirmedStudents: 1,
      pendingStudents: 1,
    });
    expect(report.projects[0].academicCourse).toMatchObject({ termId: 3, term: '202610' });
  });

  it('listProjects and getProject add the term code to the course section', async () => {
    projectsService.listProjectsInScope.mockResolvedValue({
      items: [project(1), project(2, { academicCourse: undefined }), project(3, { academicCourse: { ...course, termId: 99 } })],
    });

    const page = await service.listProjects(5, {});
    expect(page.items.map((p: any) => p.academicCourse?.term)).toEqual(['202610', undefined, null]);

    const one: any = await service.getProject(5, 1);
    expect(one.academicCourse).toMatchObject({ termId: 3, term: '202610' });
  });
});

describe('toRegistrationProject', () => {
  it('lists confirmed students with the data captured at submission and the pending ones not joined', () => {
    const row = toRegistrationProject(
      project(1, {
        state: 'REQUEST_CHANGES',
        reason: 'Falta el póster',
        tutors: [{ firstName: 'Eva', lastName: 'Ruiz', pending: false }],
        participants: [{ userId: 7, projectId: 1, studentCode: 'S1', firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com' }],
        pendingParticipants: [
          // Joined: already listed as confirmed
          { studentCode: 'S1', firstName: 'Ana', semester: '8', career: 'Sistemas', status: 'JOINED' },
          { studentCode: 'S2', firstName: 'Luis', lastName: '', email: 'luis@x.com', semester: '1', career: 'N/A', status: 'INVITED' },
        ],
      }) as any,
    );

    expect(row).toMatchObject({ state: 'REQUEST_CHANGES', reason: 'Falta el póster', tutors: ['Eva Ruiz'] });
    // The term code is added by the service (withTermCodes); on its own the course has none
    expect(row.academicCourse).toEqual({ id: 2, nrc: '1001', termId: 3, term: null, name: 'PF Sistemas', departmentName: 'Sistemas' });
    expect(row.students).toEqual([
      { status: 'CONFIRMED', userId: 7, firstName: 'Ana', lastName: 'Paz', email: 'ana@x.com', studentCode: 'S1', semester: '8', career: 'Sistemas' },
      { status: 'INVITED', userId: null, firstName: 'Luis', lastName: null, email: 'luis@x.com', studentCode: 'S2', semester: '1', career: null },
    ]);
  });

  it('accepts the state and status as numbers', () => {
    const row = toRegistrationProject(
      project(1, { state: ProjectState.REJECTED, pendingParticipants: [{ studentCode: 'S2', firstName: 'Luis', status: '2' }] }) as any,
    );

    expect(row.state).toBe('REJECTED');
    expect(row.students[0].status).toBe('INVITED');
  });
});

describe('grade rules', () => {
  it.each([
    [0, false, 'PENDING'],
    [0, true, 'PENDING'],
    [2, false, 'PRELIMINARY'],
    [2, true, 'OFFICIAL'],
  ])('%i evaluations, published %s -> %s', (count, published, status) => {
    expect(toGradeStatus(count as number, published as boolean)).toBe(status);
  });

  it.each([
    ['Dean with read:grades', user(['Dean'], ['read:grades']), true],
    ['FacultyAdmin with read:grades', user(['FacultyAdmin'], ['read:grades']), true],
    ['Admin', user(['Admin']), true],
    ['Professor', user(['Professor'], ['read:academic_projects']), false],
    ['Tutor', user(['Tutor'], ['read:academic_projects']), false],
    ['DepartmentDirector', user(['DepartmentDirector'], ['read:academic_projects']), false],
  ])('%s reads unpublished grades: %s', (_name, appUser, expected) => {
    expect(canReadUnpublishedGrades(appUser)).toBe(expected);
  });
});

describe('withoutOneofMarkers', () => {
  it('drops the "_field": "field" markers at any depth and keeps real data', () => {
    expect(
      withoutOneofMarkers({
        items: [{ id: 1, description: 'x', _description: 'description', participants: [{ _email: 'email', email: 'a@x.com' }] }],
        _note: 'something else',
        when: new Date(0),
      }),
    ).toEqual({
      items: [{ id: 1, description: 'x', participants: [{ email: 'a@x.com' }] }],
      _note: 'something else',
      when: new Date(0),
    });
  });
});

describe('studentNames', () => {
  it('names each student once, even when the confirmed one is still listed as JOINED', () => {
    const names = studentNames(
      project(1, {
        participants: [{ userId: 7, studentCode: 'S1', firstName: 'Ana', lastName: 'Paz' }],
        pendingParticipants: [
          { studentCode: 'S1', firstName: 'Ana', lastName: 'Paz', status: 'JOINED' },
          { studentCode: 'S2', firstName: 'Luis', lastName: '', status: 'INVITED' },
        ],
      }) as any,
    );

    expect(names).toEqual(['Ana Paz', 'Luis']);
  });
});

describe('byCourseThenName', () => {
  const row = (projectName: string, nrc: string | null) =>
    ({ projectName, academicCourse: nrc ? { term: '202610', nrc } : null }) as any;

  it('orders by course section, projects without one last, then by name', () => {
    const rows = [row('Zeta', null), row('Beta', '2001'), row('Alfa', null), row('Gama', '1001'), row('Alfa', '2001')];

    expect(rows.sort(byCourseThenName).map((r) => `${r.projectName}:${r.academicCourse?.nrc ?? '-'}`)).toEqual([
      'Gama:1001', 'Alfa:2001', 'Beta:2001', 'Alfa:-', 'Zeta:-',
    ]);
  });

  it('orders the NRC as a number within a term, and the terms by code', async () => {
    const at = (term: string, nrc: string) => ({ projectName: 'P', academicCourse: { term, nrc } }) as any;
    const rows = [at('202620', '1001'), at('202610', '10234'), at('202610', '9876')];

    expect(rows.sort(byCourseThenName).map((r) => `${r.academicCourse.term} ${r.academicCourse.nrc}`)).toEqual([
      '202610 9876', '202610 10234', '202620 1001',
    ]);
  });
});
