import { Project, ProjectState } from './entities/project.entity';
import { semesterOf } from './semester';

/** Event data needed by the student dashboard, as returned by event-service. */
export interface ParticipationEvent {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  /** false when the event was deleted (soft delete) */
  active: boolean;
  /** true when the event already ended (event-service status CLOSED) */
  finished: boolean;
}

/** One award won by a project, as returned by event-service. */
export interface ParticipationAward {
  projectId: number;
  awardId: number;
  title: string;
  position: number;
  categoryName: string;
  eventId: number;
}

export interface StudentAwardItem {
  awardId: number;
  title: string;
  position: number;
  categoryName: string;
}

export interface StudentParticipationItem {
  projectId: number;
  projectName: string;
  projectCode: string;
  courseName: string;
  eventId: number;
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  semester: string;
  finished: boolean;
  awards: StudentAwardItem[];
}

export interface SemesterParticipationItem {
  semester: string;
  events: number;
  projects: number;
  awards: number;
}

/** The student's project in an event that has not ended yet, whatever its review state. */
export interface StudentCurrentProject {
  projectId: number;
  eventId: number;
  eventName: string;
  eventStartDate: string;
  semester: string;
  projectCode: string;
  name: string;
  description: string;
  courseName: string;
  state: ProjectState;
  /** Only while the event is not over and the reviewer requested changes */
  canEdit: boolean;
}

export interface StudentParticipationStats {
  totalEvents: number;
  finishedEvents: number;
  ongoingEvents: number;
  totalProjects: number;
  totalAwards: number;
  bySemester: SemesterParticipationItem[];
  participations: StudentParticipationItem[];
}

/**
 * Participation statistics of a student (IRIS-V3-STD-01, dashboard content approved on 28 Oct).
 *
 * Rules:
 * - Only the projects given are counted; the caller passes the approved ones.
 * - A project counts only if its event exists and was not deleted (active). Events that
 *   already ended count as historical (`finished`), the rest as ongoing.
 * - The semester comes from the event start date (AAAA-10 / AAAA-30).
 * - Awards are those won by the counted projects in their own event; co-winners count once each.
 * - `courseNames` maps the project category (courseId) to its name; unknown ones are ''.
 */
export function buildStudentParticipationStats(
  projects: Project[],
  events: ParticipationEvent[],
  awards: ParticipationAward[],
  courseNames: Map<number, string> = new Map(),
): StudentParticipationStats {
  const eventsById = new Map(events.map((event) => [event.id, event]));

  const participations: StudentParticipationItem[] = [];
  for (const project of projects) {
    const event = eventsById.get(project.eventId);
    if (!event || !event.active) continue;
    const semester = semesterOf(event.startDate);
    if (!semester) continue;

    participations.push({
      projectId: project.id,
      projectName: project.name,
      projectCode: project.projectCode ?? '',
      courseName: courseNames.get(project.courseId) ?? '',
      eventId: event.id,
      eventName: event.name,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      semester,
      finished: event.finished,
      awards: awards
        .filter(
          (award) =>
            award.projectId === project.id && award.eventId === event.id,
        )
        .map(({ awardId, title, position, categoryName }) => ({
          awardId,
          title,
          position,
          categoryName,
        })),
    });
  }

  // Most recent event first; inside the same start date, the newest project first
  participations.sort(
    (a, b) =>
      new Date(b.eventStartDate).getTime() -
        new Date(a.eventStartDate).getTime() || b.projectId - a.projectId,
  );

  const eventIds = new Set(participations.map((p) => p.eventId));
  const finishedEventIds = new Set(
    participations.filter((p) => p.finished).map((p) => p.eventId),
  );

  const semesters = new Map<
    string,
    { events: Set<number>; projects: number; awards: number }
  >();
  for (const p of participations) {
    const entry = semesters.get(p.semester) ?? {
      events: new Set<number>(),
      projects: 0,
      awards: 0,
    };
    entry.events.add(p.eventId);
    entry.projects += 1;
    entry.awards += p.awards.length;
    semesters.set(p.semester, entry);
  }

  return {
    totalEvents: eventIds.size,
    finishedEvents: finishedEventIds.size,
    ongoingEvents: eventIds.size - finishedEventIds.size,
    totalProjects: participations.length,
    totalAwards: participations.reduce((sum, p) => sum + p.awards.length, 0),
    // "AAAA-10" < "AAAA-30" < "AAAA+1-10", so the string order is the chronological order
    bySemester: [...semesters.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semester, entry]) => ({
        semester,
        events: entry.events.size,
        projects: entry.projects,
        awards: entry.awards,
      })),
    participations,
  };
}

/**
 * The project the student has in an event that has not ended (upcoming or in progress) and
 * was not deleted, in any review state, so the dashboard can show its enrollment status.
 * With several, the one of the most recent event. null when there is none.
 */
export function pickCurrentProject(
  projects: Project[],
  events: ParticipationEvent[],
  courseNames: Map<number, string> = new Map(),
): StudentCurrentProject | null {
  const eventsById = new Map(events.map((event) => [event.id, event]));

  const candidates = projects
    .map((project) => ({ project, event: eventsById.get(project.eventId) }))
    .filter(
      (c): c is { project: Project; event: ParticipationEvent } =>
        !!c.event && c.event.active && !c.event.finished,
    )
    .sort(
      (a, b) =>
        new Date(b.event.startDate).getTime() -
          new Date(a.event.startDate).getTime() || b.project.id - a.project.id,
    );

  const current = candidates[0];
  if (!current) return null;
  const { project, event } = current;

  return {
    projectId: project.id,
    eventId: event.id,
    eventName: event.name,
    eventStartDate: event.startDate,
    semester: semesterOf(event.startDate) ?? '',
    projectCode: project.projectCode ?? '',
    name: project.name,
    description: project.description ?? '',
    courseName: courseNames.get(project.courseId) ?? '',
    state: project.state,
    canEdit: project.state === 'REQUEST_CHANGES',
  };
}
