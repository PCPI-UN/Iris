import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AcademicScope, ProjectState } from '@app/common/generated/project';
import { AcademicProfile } from '../academic-profiles';
import {
  AcademicService,
  canReadUnpublishedGrades,
  gradeView,
  toGradeStatus,
  toRegistrationProject,
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
const { PROFESSOR: AS_PROFESSOR, DEAN: AS_DEAN } = AcademicProfile;
const COURSE = AcademicScope.ACADEMIC_SCOPE_COURSE;

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
      const report = await service.getGrades(PROFESSOR, 4, AS_PROFESSOR);

      expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({
        userId: 5, eventId: 4, state: ProjectState.APPROVED, scope: COURSE,
      });
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
      const report = await service.getGrades(DEAN, 4, AS_DEAN);

      expect(report.gradeVisibility).toBe('ALL');
      expect(report.projects[0]).toMatchObject({ gradeStatus: 'PRELIMINARY', finalScore: 4.25, gradeHidden: false });
    });

    it('Admin sees unpublished grades through its role, like every other check', async () => {
      const report = await service.getGrades(user(['Admin', 'Dean']), 4, AS_DEAN);

      expect(report.projects[0].finalScore).toBe(4.25);
    });

    it('once published every caller sees official grades', async () => {
      eventsService.getEventById.mockResolvedValue({ id: 4, name: 'Feria 2026', resultsPublished: true, active: true });

      const report = await service.getGrades(PROFESSOR, 4, AS_PROFESSOR);

      expect(report.projects[0]).toMatchObject({ gradeStatus: 'OFFICIAL', finalScore: 4.25, gradeHidden: false });
      expect(report.projects[1]).toMatchObject({ gradeStatus: 'PENDING', finalScore: null });
    });

    it('a missing event is a 404', async () => {
      eventsService.getEventById.mockResolvedValue(undefined);

      await expect(service.getGrades(PROFESSOR, 4, AS_PROFESSOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(projectsService.listAllProjectsInScope).not.toHaveBeenCalled();
    });
  });

  describe('getProject', () => {
    const evaluated = {
      evaluated: true,
      finalScore: 4.25,
      maxScore: 5,
      criteria: [
        { criterionId: 1, criterion: 'Claridad', component: 'Exposición', weight: 0.4, score: 4 },
        { criterionId: 2, criterion: 'Diseño', component: 'Solución', weight: 0.6, score: 4.5 },
      ],
      consolidatedFeedback: 'Buen trabajo.\n\nFaltan pruebas.',
    };

    const published = (resultsPublished: boolean) =>
      eventsService.getEventById.mockResolvedValue({ id: 4, name: 'Feria 2026', resultsPublished, active: true });

    beforeEach(() => {
      projectsService.getProjectInScope.mockResolvedValue(project(1, { eventId: 4, courseId: 6 }));
      evaluationsService.getProjectResult = jest.fn().mockResolvedValue(evaluated);
      // Approved projects of category 6: 1 and 7 tie at 4.25, 8 is behind
      eventsService.getRankingEventByEventId = jest.fn().mockResolvedValue({ rankingEvent: { eventId: 4, positions: 3 } });
      eventsService.listApprovedProjects = jest.fn().mockResolvedValue([{ id: 1 }, { id: 7 }, { id: 8 }]);
      eventsService.getCategory = jest.fn().mockResolvedValue({ category: { id: 6, name: ' Sistemas ' } });
      evaluationsService.getAverageGrades.mockImplementation(async (ids: number[]) =>
        ids.length === 1
          ? [{ projectId: 1, averageGrade: 4.25, evaluationCount: 2 }]
          : [
              { projectId: 1, averageGrade: 4.25, evaluationCount: 2 },
              { projectId: 7, averageGrade: 4.25, evaluationCount: 3 },
              { projectId: 8, averageGrade: 3.9, evaluationCount: 3 },
            ],
      );
    });

    const visibleEvaluation = {
      gradeStatus: 'PRELIMINARY',
      assignedJurors: 3,
      completedEvaluations: 2,
      pendingEvaluations: 1,
      resultHidden: false,
      result: {
        finalScore: 4.25,
        maxScore: 5,
        components: [
          { component: 'Exposición', weight: 0.4, criteria: [{ criterionId: 1, criterion: 'Claridad', weight: 0.4, score: 4 }] },
          { component: 'Solución', weight: 0.6, criteria: [{ criterionId: 2, criterion: 'Diseño', weight: 0.6, score: 4.5 }] },
        ],
        comments: ['Buen trabajo.', 'Faltan pruebas.'],
      },
      // Tied with project 7: same position
      ranking: { position: 1, tied: true, categoryId: 6, categoryName: 'Sistemas' },
    };

    it('unpublished, without read:grades: only the juror counters, result and position hidden', async () => {
      published(false);

      const detail = await service.getProject(PROFESSOR, 1, AS_PROFESSOR);

      expect(projectsService.getProjectInScope).toHaveBeenCalledWith(5, 1, COURSE);
      expect(detail.evaluation).toEqual({
        gradeStatus: 'PRELIMINARY',
        assignedJurors: 3,
        completedEvaluations: 2,
        pendingEvaluations: 1,
        resultHidden: true,
        result: null,
        ranking: null,
      });
      expect(evaluationsService.getProjectResult).not.toHaveBeenCalled();
      expect(eventsService.listApprovedProjects).not.toHaveBeenCalled();
      expect(JSON.stringify(detail)).not.toContain('4.25');
    });

    it('unpublished, with read:grades: the result and the position', async () => {
      published(false);

      const detail = await service.getProject(DEAN, 1, AS_DEAN);

      expect(detail.evaluation).toEqual(visibleEvaluation);
      expect(evaluationsService.getProjectResult).toHaveBeenCalledWith(1);
      expect(eventsService.listApprovedProjects).toHaveBeenCalledWith(4, 6);
    });

    it.each([
      ['without read:grades', PROFESSOR, AS_PROFESSOR],
      ['with read:grades', DEAN, AS_DEAN],
    ])('published, %s: the official result and the position', async (_name, caller, profile) => {
      published(true);

      const detail = await service.getProject(caller, 1, profile);

      expect(detail.evaluation).toEqual({ ...visibleEvaluation, gradeStatus: 'OFFICIAL' });
    });

    it('keeps the project fields and the term code next to the evaluation', async () => {
      const detail: any = await service.getProject(DEAN, 1, AS_DEAN);

      expect(detail).toMatchObject({ id: 1, name: 'P1', academicCourse: { term: '202610' } });
    });

    it('without evaluations: PENDING, nothing hidden, no result even for read:grades', async () => {
      published(true);
      evaluationsService.getAverageGrades.mockResolvedValue([]);

      const detail = await service.getProject(DEAN, 1, AS_DEAN);

      expect(detail.evaluation).toEqual({
        gradeStatus: 'PENDING',
        assignedJurors: 3,
        completedEvaluations: 0,
        pendingEvaluations: 3,
        resultHidden: false,
        result: null,
        ranking: null,
      });
      expect(evaluationsService.getProjectResult).not.toHaveBeenCalled();
    });

    it('a project outside the scope is still a 404', async () => {
      projectsService.getProjectInScope.mockRejectedValue(new NotFoundException());

      await expect(service.getProject(DEAN, 1, AS_DEAN)).rejects.toBeInstanceOf(NotFoundException);
      expect(evaluationsService.getAverageGrades).not.toHaveBeenCalled();
    });

    it('no position for a project that is not approved', async () => {
      projectsService.getProjectInScope.mockResolvedValue(project(1, { eventId: 4, courseId: 6, state: 'REQUEST_CHANGES' }));

      const detail = await service.getProject(DEAN, 1, AS_DEAN);

      expect(detail.evaluation.result).not.toBeNull();
      expect(detail.evaluation.ranking).toBeNull();
      expect(eventsService.getRankingEventByEventId).not.toHaveBeenCalled();
    });

    it('no position when the event has no ranking configuration (NOT_FOUND)', async () => {
      eventsService.getRankingEventByEventId.mockRejectedValue(Object.assign(new Error('no ranking'), { code: 5 }));

      const detail = await service.getProject(DEAN, 1, AS_DEAN);

      expect(detail.evaluation.ranking).toBeNull();
      expect(detail.evaluation.result).not.toBeNull();
    });

    it('a ranking failure leaves the position out instead of failing the detail', async () => {
      eventsService.listApprovedProjects.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 14 }));

      const detail = await service.getProject(DEAN, 1, AS_DEAN);

      expect(detail.evaluation.ranking).toBeNull();
      expect(detail.evaluation.result).not.toBeNull();
    });

    it('an untied position is not marked as tied', async () => {
      evaluationsService.getAverageGrades.mockImplementation(async (ids: number[]) =>
        ids.length === 1
          ? [{ projectId: 1, averageGrade: 3.9, evaluationCount: 2 }]
          : [
              { projectId: 1, averageGrade: 3.9, evaluationCount: 2 },
              { projectId: 7, averageGrade: 4.25, evaluationCount: 3 },
              { projectId: 8, averageGrade: 4.25, evaluationCount: 3 },
            ],
      );

      const detail = await service.getProject(DEAN, 1, AS_DEAN);

      // 7 and 8 share the first position, so the next one is 2
      expect(detail.evaluation.ranking).toMatchObject({ position: 2, tied: false });
    });
  });

  it('listProjects passes the caller and the filters to project-service', async () => {
    await service.listProjects(PROFESSOR, {
      profile: AS_PROFESSOR, eventId: 4, state: 'APPROVED' as any, academicCourseId: 2, q: 'eco',
    });

    expect(projectsService.listProjectsInScope).toHaveBeenCalledWith({
      userId: 5, scope: COURSE, eventId: 4, state: ProjectState.APPROVED, academicCourseId: 2, q: 'eco', currentPage: 1, itemsPerPage: 10,
    });
  });

  it('listEvents keeps the order of event-service and leaves out the deleted events', async () => {
    const events = await service.listEvents(PROFESSOR, AS_PROFESSOR);

    expect(projectsService.listEventIdsInScope).toHaveBeenCalledWith(5, COURSE);
    expect(eventsService.listEventsByIds).toHaveBeenCalledWith([4, 8, 9]);
    expect(events.map((e) => e.id)).toEqual([8, 4]);
  });

  describe('event of /registrations and /grades', () => {
    const calls = (s: AcademicService) => [
      () => s.getRegistrations(PROFESSOR, 4, AS_PROFESSOR),
      () => s.getGrades(PROFESSOR, 4, AS_PROFESSOR),
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

    const report = await service.getRegistrations(PROFESSOR, 4, AS_PROFESSOR);

    expect(projectsService.listEventIdsInScope).toHaveBeenCalledWith(5, COURSE);
    expect(projectsService.listAllProjectsInScope).toHaveBeenCalledWith({ userId: 5, eventId: 4, scope: COURSE });
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

    const page = await service.listProjects(PROFESSOR, { profile: AS_PROFESSOR });
    expect(page.items.map((p: any) => p.academicCourse?.term)).toEqual(['202610', undefined, null]);

    const one: any = await service.getProject(PROFESSOR, 1, AS_PROFESSOR);
    expect(projectsService.getProjectInScope).toHaveBeenCalledWith(5, 1, COURSE);
    expect(one.academicCourse).toMatchObject({ termId: 3, term: '202610' });
  });
  describe('profile', () => {
    // Ana: Professor of NRC 10234 and Tutor of a project of NRC 9876
    const ANA = user(['Professor', 'Tutor'], ['read:academic_projects']);

    it('applies only the scope of the profile asked for', async () => {
      await service.listProjects(ANA, { profile: AcademicProfile.TUTOR });
      await service.listProjects(ANA, { profile: AcademicProfile.PROFESSOR });

      expect(projectsService.listProjectsInScope.mock.calls.map(([request]: any[]) => request.scope)).toEqual([
        AcademicScope.ACADEMIC_SCOPE_TUTORED,
        AcademicScope.ACADEMIC_SCOPE_COURSE,
      ]);
    });

    it('a profile whose role the caller lacks is a 403 on every endpoint, before calling project-service', async () => {
      const calls = [
        () => service.listProjects(ANA, { profile: AcademicProfile.DIRECTOR }),
        () => service.getProject(ANA, 1, AcademicProfile.DIRECTOR),
        () => service.listEvents(ANA, AcademicProfile.DEAN),
        () => service.getRegistrations(ANA, 4, AcademicProfile.DIRECTOR),
        // Admin has no academic profile: the role, not the permission guard bypass, decides
        () => service.getGrades(user(['Admin']), 4, AcademicProfile.DEAN),
      ];

      for (const call of calls) {
        await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(projectsService.listProjectsInScope).not.toHaveBeenCalled();
      expect(projectsService.getProjectInScope).not.toHaveBeenCalled();
      expect(projectsService.listEventIdsInScope).not.toHaveBeenCalled();
    });

    it('listProfiles returns the profiles of the caller roles; [] for a student or an Admin', () => {
      expect(service.listProfiles(ANA)).toEqual(['PROFESSOR', 'TUTOR']);
      expect(service.listProfiles(user(['User']))).toEqual([]);
      expect(service.listProfiles(user(['Admin']))).toEqual([]);
    });
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
    // evaluations, published, reads unpublished -> status, visible, hidden
    [0, false, false, 'PENDING', false, false],
    [0, true, true, 'PENDING', false, false],
    [2, false, false, 'PRELIMINARY', false, true],
    [2, false, true, 'PRELIMINARY', true, false],
    [2, true, false, 'OFFICIAL', true, false],
    [2, true, true, 'OFFICIAL', true, false],
  ])('gradeView %i evaluations, published %s, reads unpublished %s', (count, isPublished, sees, gradeStatus, visible, hidden) => {
    expect(gradeView(count as number, isPublished as boolean, sees as boolean)).toEqual({ gradeStatus, visible, hidden });
  });

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
