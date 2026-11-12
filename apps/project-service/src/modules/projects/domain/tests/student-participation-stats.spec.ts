import { Project, ProjectState } from '../entities/project.entity';
import {
  ParticipationAward,
  ParticipationEvent,
  buildStudentParticipationStats,
  pickCurrentProject,
} from '../student-participation-stats';

const project = (id: number, eventId: number): Project => ({
  id,
  eventId,
  courseId: 1,
  name: `Project ${id}`,
  state: 'APPROVED',
});

const event = (
  id: number,
  startDate: string,
  overrides: Partial<ParticipationEvent> = {},
): ParticipationEvent => ({
  id,
  name: `Event ${id}`,
  startDate,
  endDate: startDate,
  active: true,
  finished: true,
  inProgress: false,
  ...overrides,
});

const award = (
  projectId: number,
  eventId: number,
  awardId: number,
  position = 1,
): ParticipationAward => ({
  projectId,
  eventId,
  awardId,
  title: `Award ${awardId}`,
  position,
  categoryName: 'Sistemas',
  resultsPublished: true,
});

describe('buildStudentParticipationStats', () => {
  it('returns zeros and empty lists when there is nothing to count', () => {
    expect(buildStudentParticipationStats([], [], [])).toEqual({
      totalEvents: 0,
      finishedEvents: 0,
      ongoingEvents: 0,
      totalProjects: 0,
      totalAwards: 0,
      bySemester: [],
      participations: [],
    });
  });

  it('counts events, projects and awards and separates finished from ongoing events', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10), project(2, 20), project(3, 30)],
      [
        event(10, '2025-03-10T15:00:00.000Z'),
        event(20, '2025-09-10T15:00:00.000Z'),
        event(30, '2026-11-20T15:00:00.000Z', { finished: false }),
      ],
      [award(1, 10, 100), award(2, 20, 200, 2)],
    );

    expect(stats.totalEvents).toBe(3);
    expect(stats.finishedEvents).toBe(2);
    expect(stats.ongoingEvents).toBe(1);
    expect(stats.totalProjects).toBe(3);
    expect(stats.totalAwards).toBe(2);
  });

  it('leaves out projects whose event was deleted or is unknown', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10), project(2, 20), project(3, 99)],
      [
        event(10, '2025-03-10T15:00:00.000Z'),
        event(20, '2025-04-10T15:00:00.000Z', { active: false }),
      ],
      [award(2, 20, 200)],
    );

    expect(stats.participations.map((p) => p.projectId)).toEqual([1]);
    expect(stats.totalEvents).toBe(1);
    expect(stats.totalAwards).toBe(0);
  });

  it('counts an event once when the student has two projects in it', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10), project(2, 10)],
      [event(10, '2025-03-10T15:00:00.000Z')],
      [],
    );

    expect(stats.totalEvents).toBe(1);
    expect(stats.totalProjects).toBe(2);
    expect(stats.bySemester).toEqual([
      { semester: '2025-10', events: 1, projects: 2, awards: 0 },
    ]);
  });

  it('groups by semester from the oldest one', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10), project(2, 20), project(3, 30)],
      [
        event(30, '2026-02-10T15:00:00.000Z'),
        event(10, '2025-03-10T15:00:00.000Z'),
        event(20, '2025-08-10T15:00:00.000Z'),
      ],
      [award(3, 30, 300), award(3, 30, 301, 2)],
    );

    expect(stats.bySemester).toEqual([
      { semester: '2025-10', events: 1, projects: 1, awards: 0 },
      { semester: '2025-30', events: 1, projects: 1, awards: 0 },
      { semester: '2026-10', events: 1, projects: 1, awards: 2 },
    ]);
  });

  it('lists participations from the most recent event with their awards', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10), project(2, 20)],
      [
        event(10, '2025-03-10T15:00:00.000Z'),
        event(20, '2025-08-10T15:00:00.000Z', { finished: false }),
      ],
      [award(1, 10, 100)],
    );

    expect(stats.participations).toEqual([
      {
        projectId: 2,
        projectName: 'Project 2',
        projectCode: '',
        courseName: '',
        eventId: 20,
        eventName: 'Event 20',
        eventStartDate: '2025-08-10T15:00:00.000Z',
        eventEndDate: '2025-08-10T15:00:00.000Z',
        semester: '2025-30',
        finished: false,
        awards: [],
      },
      {
        projectId: 1,
        projectName: 'Project 1',
        projectCode: '',
        courseName: '',
        eventId: 10,
        eventName: 'Event 10',
        eventStartDate: '2025-03-10T15:00:00.000Z',
        eventEndDate: '2025-03-10T15:00:00.000Z',
        semester: '2025-10',
        finished: true,
        awards: [
          {
            awardId: 100,
            title: 'Award 100',
            position: 1,
            categoryName: 'Sistemas',
          },
        ],
      },
    ]);
  });

  it('ignores awards of another event than the project event', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10)],
      [event(10, '2025-03-10T15:00:00.000Z')],
      [award(1, 99, 100)],
    );

    expect(stats.totalAwards).toBe(0);
  });

  it('hides awards until the event ranking is published', () => {
    const stats = buildStudentParticipationStats(
      [project(1, 10), project(2, 20)],
      [
        event(10, '2025-03-10T15:00:00.000Z'),
        event(20, '2025-09-10T15:00:00.000Z'),
      ],
      [award(1, 10, 100), { ...award(2, 20, 200), resultsPublished: false }],
    );

    expect(stats.totalAwards).toBe(1);
    expect(stats.participations.find((p) => p.projectId === 2)?.awards).toEqual(
      [],
    );
    expect(stats.bySemester).toEqual([
      { semester: '2025-10', events: 1, projects: 1, awards: 1 },
      { semester: '2025-30', events: 1, projects: 1, awards: 0 },
    ]);
  });
});

describe('pickCurrentProject', () => {
  const withState = (
    id: number,
    eventId: number,
    state: ProjectState,
  ): Project => ({
    ...project(id, eventId),
    projectCode: `P-${id}`,
    description: `About ${id}`,
    state,
  });
  const courses = new Map([[1, 'Sistemas']]);

  it('returns null when every event already ended', () => {
    expect(
      pickCurrentProject(
        [project(1, 10)],
        [event(10, '2025-03-10T15:00:00.000Z')],
        courses,
      ),
    ).toBeNull();
  });

  it('ignores deleted events', () => {
    expect(
      pickCurrentProject(
        [project(1, 10)],
        [
          event(10, '2026-11-20T15:00:00.000Z', {
            finished: false,
            active: false,
          }),
        ],
        courses,
      ),
    ).toBeNull();
  });

  it('takes the project of an event that has not ended, in any review state', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'UNDER_REVIEW')],
      [event(10, '2026-11-20T15:00:00.000Z', { finished: false })],
      courses,
    );

    expect(current).toEqual({
      projectId: 1,
      eventId: 10,
      eventName: 'Event 10',
      eventStartDate: '2026-11-20T15:00:00.000Z',
      semester: '2026-30',
      projectCode: 'P-1',
      name: 'Project 1',
      description: 'About 1',
      courseName: 'Sistemas',
      state: 'UNDER_REVIEW',
      canEdit: false,
    });
  });

  it('allows editing only when changes were requested', () => {
    const states: ProjectState[] = [
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'REQUEST_CHANGES',
    ];
    const canEdit = states.map(
      (state) =>
        pickCurrentProject(
          [withState(1, 10, state)],
          [event(10, '2026-11-20T15:00:00.000Z', { finished: false })],
        )?.canEdit,
    );

    expect(canEdit).toEqual([false, false, false, true]);
  });

  const inProgress = { finished: false, inProgress: true };
  const upcoming = { finished: false, inProgress: false };

  it('picks the event that started last when several are in progress', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'APPROVED'), withState(2, 20, 'APPROVED')],
      [
        event(10, '2026-10-01T15:00:00.000Z', inProgress),
        event(20, '2026-11-01T15:00:00.000Z', inProgress),
      ],
    );

    expect(current?.projectId).toBe(2);
  });

  it('picks the upcoming event that starts first when none is in progress', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'UNDER_REVIEW'), withState(2, 20, 'UNDER_REVIEW')],
      [
        event(10, '2027-03-01T15:00:00.000Z', upcoming),
        event(20, '2026-12-01T15:00:00.000Z', upcoming),
      ],
    );

    expect(current?.projectId).toBe(2);
  });

  it('puts an event in progress before an upcoming one', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'APPROVED'), withState(2, 20, 'UNDER_REVIEW')],
      [
        event(10, '2026-11-01T15:00:00.000Z', inProgress),
        event(20, '2026-12-01T15:00:00.000Z', upcoming),
      ],
    );

    expect(current?.projectId).toBe(1);
  });

  it('does not let a rejected project displace an approved one', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'APPROVED'), withState(2, 20, 'REJECTED')],
      [
        event(10, '2026-11-01T15:00:00.000Z', inProgress),
        event(20, '2026-12-01T15:00:00.000Z', upcoming),
      ],
    );

    expect(current?.projectId).toBe(1);
  });

  it('does not let a rejected project in progress displace an upcoming one', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'REJECTED'), withState(2, 20, 'UNDER_REVIEW')],
      [
        event(10, '2026-11-01T15:00:00.000Z', inProgress),
        event(20, '2026-12-01T15:00:00.000Z', upcoming),
      ],
    );

    expect(current?.projectId).toBe(2);
  });

  it('shows a rejected project when it is the only candidate', () => {
    const current = pickCurrentProject(
      [withState(1, 10, 'REJECTED')],
      [event(10, '2026-11-01T15:00:00.000Z', inProgress)],
    );

    expect(current).toMatchObject({ projectId: 1, state: 'REJECTED' });
  });
});
