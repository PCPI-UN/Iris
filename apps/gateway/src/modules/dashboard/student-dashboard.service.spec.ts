import { StudentDashboardService } from './student-dashboard.service';
import { ProjectsService } from '../projects/projects.service';
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

  const build = (overrides: { stats?: object; academic?: object } = {}) => {
    const projects = {
      getStudentParticipationStats: jest
        .fn()
        .mockResolvedValue(overrides.stats ?? stats),
      listUserParticipations: jest.fn().mockResolvedValue({
        participations: [],
        total: 0,
        academic: overrides.academic ?? {
          studentCode: '200145892',
          career: 'Ingeniería de Sistemas',
          semester: '8',
        },
      }),
    };
    return {
      service: new StudentDashboardService(
        projects as unknown as ProjectsService,
      ),
      projects,
    };
  };

  it('asks project-service only for the session user', async () => {
    const { service, projects } = build();

    await service.getDashboard(user);

    expect(projects.getStudentParticipationStats).toHaveBeenCalledWith(7);
    expect(projects.listUserParticipations).toHaveBeenCalledWith(
      7,
      'maria@test.local',
      1,
    );
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

  it('never sends scores: results stay unpublished until task S2-10', async () => {
    const { service } = build();

    const dashboard = await service.getDashboard(user);

    expect(dashboard.evaluation).toEqual({
      resultsPublished: false,
      finalScore: null,
    });
    expect(dashboard.trajectory.every((t) => t.finalScore === null)).toBe(true);
  });

  it('returns null current project and evaluation when there is no event in progress', async () => {
    const { service } = build({
      stats: { ...stats, currentProject: null },
    });

    const dashboard = await service.getDashboard(user);

    expect(dashboard.currentProject).toBeNull();
    expect(dashboard.evaluation).toBeNull();
  });
});
