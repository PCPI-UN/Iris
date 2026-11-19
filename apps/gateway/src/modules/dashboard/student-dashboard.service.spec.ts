import { StudentDashboardService } from './student-dashboard.service';
import { ProjectsService } from '../projects/projects.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { AppUser } from '../auth/types/app-user.type';

describe('StudentDashboardService', () => {
  const user: AppUser = {
    id: 7,
    firstName: 'María',
    lastName: 'García',
    email: 'maria@test.local',
    phone: '3001112233',
    active: true,
    status: 'CONFIRMED',
    platformRoles: [{ id: 2, name: 'User', scope: 'PLATFORM' }],
    platformPermissions: [],
  };

  const stats = {
    totalEvents: 2,
    finishedEvents: 1,
    ongoingEvents: 1,
    totalProjects: 2,
    totalAwards: 1,
    bySemester: [
      { semester: '2025-30', events: 1, projects: 1, awards: 1 },
      { semester: '2026-30', events: 1, projects: 1, awards: 0 },
    ],
    participations: [
      {
        projectId: 34,
        projectName: 'Detección de fugas',
        projectCode: 'PROY-088',
        courseName: 'Sistemas',
        eventId: 3,
        eventName: 'Feria 2026-30',
        eventStartDate: '2026-11-20T15:00:00.000Z',
        eventEndDate: '2026-11-21T15:00:00.000Z',
        semester: '2026-30',
        finished: false,
        awards: [],
      },
      {
        projectId: 20,
        projectName: 'Búsqueda semántica',
        projectCode: '',
        courseName: '',
        eventId: 2,
        eventName: 'Feria 2025-30',
        eventStartDate: '2025-09-20T15:00:00.000Z',
        eventEndDate: '2025-09-21T15:00:00.000Z',
        semester: '2025-30',
        finished: true,
        awards: [
          {
            awardId: 5,
            title: 'Primer puesto',
            position: 1,
            categoryName: 'Sistemas',
          },
          {
            awardId: 9,
            title: 'Mención de honor',
            position: 1,
            categoryName: 'Innovación',
          },
        ],
      },
    ],
    currentProject: {
      projectId: 34,
      eventId: 3,
      eventName: 'Feria 2026-30',
      eventStartDate: '2026-11-20T15:00:00.000Z',
      semester: '2026-30',
      projectCode: 'PROY-088',
      name: 'Detección de fugas',
      description: '',
      courseName: 'Sistemas',
      state: 'REQUEST_CHANGES',
      canEdit: true,
      participantsCount: 2,
      documentsCount: 1,
    },
  };

  const build = (
    overrides: {
      stats?: object;
      academic?: object;
      grades?: { projectId: number; averageGrade: number }[];
    } = {},
  ) => {
    const projects = {
      getStudentParticipationStats: jest.fn().mockResolvedValue({
        ...stats,
        academic: {
          studentCode: '200145892',
          career: 'Ingeniería de Sistemas',
          semester: '8',
        },
        ...overrides.stats,
        ...(overrides.academic ? { academic: overrides.academic } : {}),
      }),
      listUserParticipations: jest.fn(),
    };
    const evaluations = {
      getAverageGrades: jest.fn(() =>
        overrides.grades
          ? Promise.resolve(overrides.grades)
          : Promise.reject(new Error('unavailable')),
      ),
    };
    return {
      service: new StudentDashboardService(
        projects as unknown as ProjectsService,
        evaluations as unknown as EvaluationsService,
      ),
      projects,
      evaluations,
    };
  };

  it('makes a single call to project-service for the session user', async () => {
    const { service, projects } = build();

    await service.getDashboard(user);

    expect(projects.getStudentParticipationStats).toHaveBeenCalledTimes(1);
    expect(projects.getStudentParticipationStats).toHaveBeenCalledWith(
      7,
      'maria@test.local',
    );
    expect(projects.listUserParticipations).not.toHaveBeenCalled();
  });

  it('returns null academic fields when project-service sends none', async () => {
    const { service } = build({ academic: {} });

    const { profile } = await service.getDashboard(user);

    expect(profile).toMatchObject({
      studentCode: null,
      career: null,
      semester: null,
    });
  });

  it('builds the profile from the session and the academic data', async () => {
    const { service } = build();

    const { profile } = await service.getDashboard(user);

    expect(profile).toEqual({
      id: 7,
      firstName: 'María',
      lastName: 'García',
      email: 'maria@test.local',
      studentCode: '200145892',
      career: 'Ingeniería de Sistemas',
      semester: 8,
    });
  });

  it('returns null semester when the captured value is not a number', async () => {
    const { service } = build({
      academic: { studentCode: '', career: '', semester: 'octavo' },
    });

    const { profile } = await service.getDashboard(user);

    expect(profile.studentCode).toBeNull();
    expect(profile.career).toBeNull();
    expect(profile.semester).toBeNull();
  });

  it('maps the KPIs, the current project and the trajectory', async () => {
    const { service } = build();

    const dashboard = await service.getDashboard(user);

    expect(dashboard.kpis).toEqual({
      totalFairs: 2,
      totalProjects: 2,
      totalAwards: 1,
    });
    expect(dashboard.currentProject).toEqual({
      id: 34,
      eventId: 3,
      eventName: 'Feria 2026-30',
      semester: '2026-30',
      projectCode: 'PROY-088',
      name: 'Detección de fugas',
      description: null,
      categoryName: 'Sistemas',
      enrollmentStatus: 'REQUEST_CHANGES',
      canEdit: true,
      participantsCount: 2,
      documentsCount: 1,
    });
    expect(dashboard.trajectory).toEqual([
      {
        id: 34,
        eventId: 3,
        semester: '2026-30',
        eventName: 'Feria 2026-30',
        courseName: 'Sistemas',
        projectName: 'Detección de fugas',
        finalScore: null,
        award: null,
        isCurrent: true,
        certificates: [],
      },
      {
        id: 20,
        eventId: 2,
        semester: '2025-30',
        eventName: 'Feria 2025-30',
        courseName: null,
        projectName: 'Búsqueda semántica',
        finalScore: null,
        award: 'Primer puesto, Mención de honor',
        isCurrent: false,
        certificates: [],
      },
    ]);
    expect(dashboard.bySemester).toEqual([
      { semester: '2025-30', fairs: 1, projects: 1, awards: 1 },
      { semester: '2026-30', fairs: 1, projects: 1, awards: 0 },
    ]);
  });

  it('sends no score and asks for none while the results are not published', async () => {
    const { service, evaluations } = build();

    const dashboard = await service.getDashboard(user);

    expect(evaluations.getAverageGrades).not.toHaveBeenCalled();
    expect(dashboard.evaluation).toEqual({
      resultsPublished: false,
      finalScore: null,
    });
    expect(dashboard.trajectory.every((t) => t.finalScore === null)).toBe(true);
  });

  it('adds the scores of the events whose results are published', async () => {
    const { service, evaluations } = build({
      stats: {
        participations: [
          { ...stats.participations[0], resultsPublished: true },
          { ...stats.participations[1], resultsPublished: true },
        ],
        currentProject: { ...stats.currentProject, resultsPublished: true },
      },
      // Project 20 has no evaluations: it is left out of the averages
      grades: [{ projectId: 34, averageGrade: 72.5 }],
    });

    const dashboard = await service.getDashboard(user);

    // One call for every score; the current project is also in the trajectory
    expect(evaluations.getAverageGrades).toHaveBeenCalledTimes(1);
    expect(evaluations.getAverageGrades).toHaveBeenCalledWith([34, 20]);
    expect(dashboard.evaluation).toEqual({
      resultsPublished: true,
      finalScore: 72.5,
    });
    expect(dashboard.trajectory.map((t) => [t.id, t.finalScore])).toEqual([
      [34, 72.5],
      [20, null],
    ]);
  });

  it('keeps the dashboard when the scores cannot be read', async () => {
    const { service } = build({
      stats: {
        participations: [
          { ...stats.participations[1], resultsPublished: true },
        ],
        currentProject: null,
      },
    });

    const dashboard = await service.getDashboard(user);

    expect(dashboard.trajectory).toHaveLength(1);
    expect(dashboard.trajectory[0].finalScore).toBeNull();
  });

  it('returns null current project and evaluation when there is no event in progress', async () => {
    const { service } = build({
      stats: { currentProject: null },
    });

    const dashboard = await service.getDashboard(user);

    expect(dashboard.currentProject).toBeNull();
    expect(dashboard.evaluation).toBeNull();
  });
});
