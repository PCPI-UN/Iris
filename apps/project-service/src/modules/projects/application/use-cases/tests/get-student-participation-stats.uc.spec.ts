import { GetStudentParticipationStatsUC } from '../get-student-participation-stats.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { EventServicePort } from '../../ports/event-service.port';
import { Project, ProjectState } from '../../../domain/entities/project.entity';
import { ValidationError } from '../../../domain/errors';

describe('GetStudentParticipationStatsUC', () => {
  const project = (
    id: number,
    eventId: number,
    state: ProjectState = 'APPROVED',
    courseId = 1,
  ): Project => ({
    id,
    eventId,
    courseId,
    name: `Project ${id}`,
    projectCode: `P-${id}`,
    description: `About ${id}`,
    state,
  });

  const pastEvent = {
    id: 10,
    name: 'Feria 2025-10',
    startDate: '2025-03-10T15:00:00.000Z',
    endDate: '2025-03-11T15:00:00.000Z',
    active: true,
    finished: true,
    inProgress: false,
  };
  const ongoingEvent = {
    id: 20,
    name: 'Feria 2026-30',
    startDate: '2026-11-20T15:00:00.000Z',
    endDate: '2026-11-21T15:00:00.000Z',
    active: true,
    finished: false,
    inProgress: true,
  };

  const build = (projects: Project[]) => {
    const repo = {
      listProjectsByParticipant: jest.fn().mockResolvedValue(projects),
      listPendingParticipants: jest
        .fn()
        .mockResolvedValue([{ projectId: 0 }, { projectId: 0 }]),
      listDocuments: jest
        .fn()
        .mockResolvedValue([{ state: 'ACTIVE' }, { state: 'INACTIVE' }]),
      listParticipationsByUser: jest.fn().mockResolvedValue([
        {
          project: project(1, 10),
          studentCode: '200145892',
          career: 'Ingeniería de Sistemas',
          semester: '8',
        },
      ]),
    };
    const events = {
      listEventsByIds: jest.fn().mockResolvedValue([pastEvent, ongoingEvent]),
      listAwardsByProjects: jest.fn().mockResolvedValue([
        {
          projectId: 1,
          eventId: 10,
          awardId: 5,
          title: 'Primer puesto',
          position: 1,
          categoryName: 'Sistemas',
          resultsPublished: true,
        },
      ]),
      listCategoriesByIds: jest
        .fn()
        .mockResolvedValue([{ id: 1, name: 'Ingeniería de Sistemas' }]),
    };
    const uc = new GetStudentParticipationStatsUC(
      repo as unknown as ProjectRepository,
      events as unknown as EventServicePort,
    );
    return { uc, repo, events };
  };

  it('asks for every project of the given user, whatever its state', async () => {
    const { uc, repo } = build([]);

    await uc.execute({ userId: 7 });

    expect(repo.listProjectsByParticipant).toHaveBeenCalledWith(7, []);
  });

  it('does not call event-service when the user has no projects', async () => {
    const { uc, events } = build([]);

    const result = await uc.execute({ userId: 7 });

    expect(events.listEventsByIds).not.toHaveBeenCalled();
    expect(events.listAwardsByProjects).not.toHaveBeenCalled();
    expect(result.totalEvents).toBe(0);
    expect(result.participations).toEqual([]);
    expect(result.currentProject).toBeNull();
  });

  it('counts only approved projects and asks awards only for them', async () => {
    const { uc, events } = build([
      project(1, 10),
      project(2, 10),
      project(3, 20, 'UNDER_REVIEW'),
    ]);

    const result = await uc.execute({ userId: 7 });

    expect(events.listEventsByIds).toHaveBeenCalledWith([10, 20]);
    expect(events.listAwardsByProjects).toHaveBeenCalledWith([1, 2]);
    expect(result.totalEvents).toBe(1);
    expect(result.totalProjects).toBe(2);
    expect(result.totalAwards).toBe(1);
    expect(result.bySemester).toEqual([
      { semester: '2025-10', events: 1, projects: 2, awards: 1 },
    ]);
    expect(result.participations[0]).toMatchObject({
      projectCode: 'P-2',
      courseName: 'Ingeniería de Sistemas',
    });
  });

  it('returns the project of the event in progress in any state, with its team and active documents', async () => {
    const { uc, repo } = build([
      project(1, 10),
      project(3, 20, 'REQUEST_CHANGES'),
    ]);

    const { currentProject } = await uc.execute({ userId: 7 });

    expect(currentProject).toEqual({
      projectId: 3,
      eventId: 20,
      eventName: 'Feria 2026-30',
      eventStartDate: '2026-11-20T15:00:00.000Z',
      semester: '2026-30',
      projectCode: 'P-3',
      name: 'Project 3',
      description: 'About 3',
      courseName: 'Ingeniería de Sistemas',
      state: 'REQUEST_CHANGES',
      canEdit: true,
      participantsCount: 2,
      documentsCount: 1,
    });
    expect(repo.listPendingParticipants).toHaveBeenCalledWith(3);
    expect(repo.listDocuments).toHaveBeenCalledWith(3);
  });

  it('has no current project when every event already ended', async () => {
    const { uc, repo } = build([project(1, 10)]);

    const { currentProject } = await uc.execute({ userId: 7 });

    expect(currentProject).toBeNull();
    expect(repo.listPendingParticipants).not.toHaveBeenCalled();
  });

  it('reads every category name in a single call', async () => {
    const { uc, events } = build([
      project(1, 10, 'APPROVED', 1),
      project(2, 10, 'APPROVED', 1),
      project(3, 20, 'UNDER_REVIEW', 2),
    ]);

    await uc.execute({ userId: 7 });

    expect(events.listCategoriesByIds).toHaveBeenCalledTimes(1);
    expect(events.listCategoriesByIds).toHaveBeenCalledWith([1, 2]);
  });

  it('leaves the category name empty when event-service does not find it', async () => {
    const { uc } = build([project(1, 10, 'APPROVED', 99)]);

    const { participations } = await uc.execute({ userId: 7 });

    expect(participations[0].courseName).toBe('');
  });

  it('keeps the dashboard when the category names cannot be read', async () => {
    const { uc, events } = build([project(1, 10)]);
    events.listCategoriesByIds.mockRejectedValue(new Error('unavailable'));

    const result = await uc.execute({ userId: 7 });

    expect(result.totalProjects).toBe(1);
    expect(result.participations[0].courseName).toBe('');
  });

  it('returns the academic data in the same response', async () => {
    const { uc, repo } = build([project(1, 10)]);

    const { academic } = await uc.execute({
      userId: 7,
      email: 'maria@test.local',
    });

    expect(repo.listParticipationsByUser).toHaveBeenCalledWith(
      7,
      'maria@test.local',
    );
    expect(academic).toEqual({
      studentCode: '200145892',
      career: 'Ingeniería de Sistemas',
      semester: '8',
    });
  });

  it('returns empty academic data without an email', async () => {
    const { uc, repo } = build([]);

    const { academic } = await uc.execute({ userId: 7 });

    expect(repo.listParticipationsByUser).not.toHaveBeenCalled();
    expect(academic).toEqual({
      studentCode: null,
      career: null,
      semester: null,
    });
  });

  it.each([0, -1, 1.5, NaN])(
    'rejects the invalid user id %p',
    async (userId) => {
      const { uc, repo } = build([]);

      await expect(uc.execute({ userId })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(repo.listProjectsByParticipant).not.toHaveBeenCalled();
    },
  );
});
