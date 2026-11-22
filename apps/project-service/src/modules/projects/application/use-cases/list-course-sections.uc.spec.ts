import { ListCourseSectionsUC, PROFESSORS_LOOKUP_TIMEOUT_MS } from './list-course-sections.uc';
import { AcademicCourseView, ProjectRepository } from '../../domain/repositories/project.repository';
import { NotFoundError } from '../../domain/errors';
import { AuthServicePort } from '../ports/auth-service.port';
import { EventServicePort } from '../ports/event-service.port';

describe('ListCourseSectionsUC', () => {
  const course = (id: number, nrc: string, professorUserId: number): AcademicCourseView => ({
    id,
    nrc,
    termId: 5,
    name: `Curso ${nrc}`,
    professorUserId,
    departmentId: 1,
    departmentName: 'Ingeniería de Sistemas',
  });

  const user = (id: number, firstName: string, lastName?: string) => ({
    id,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@uni.edu`,
    status: 'CONFIRMED',
  });

  const build = (opts: {
    event?: object | null;
    courses?: AcademicCourseView[];
    findUsersByIds?: jest.Mock;
  }) => {
    const listAcademicCoursesByTerm = jest.fn().mockResolvedValue(opts.courses ?? []);
    const getEventById = jest
      .fn()
      .mockResolvedValue(opts.event === undefined ? { id: 1, termId: 5, requiresCourse: true } : opts.event);
    const findUsersByIds = opts.findUsersByIds ?? jest.fn().mockResolvedValue([]);
    const uc = new ListCourseSectionsUC(
      { listAcademicCoursesByTerm } as unknown as ProjectRepository,
      { getEventById } as unknown as EventServicePort,
      { findUsersByIds } as unknown as AuthServicePort,
    );
    return { uc, listAcademicCoursesByTerm, getEventById, findUsersByIds };
  };

  it('lists the sections of the term of the event with the professor names', async () => {
    const { uc, listAcademicCoursesByTerm, findUsersByIds } = build({
      courses: [course(7, '1001', 12), course(8, '1002', 13)],
      findUsersByIds: jest.fn().mockResolvedValue([user(12, 'Laura', 'Gómez'), user(13, 'Pedro')]),
    });

    await expect(uc.execute({ eventId: 1 })).resolves.toEqual({
      sections: [
        {
          id: 7,
          nrc: '1001',
          name: 'Curso 1001',
          professor: { userId: 12, firstName: 'Laura', lastName: 'Gómez' },
        },
        {
          id: 8,
          nrc: '1002',
          name: 'Curso 1002',
          professor: { userId: 13, firstName: 'Pedro', lastName: null },
        },
      ],
      professorsAvailable: true,
    });
    expect(listAcademicCoursesByTerm).toHaveBeenCalledWith(5);
    expect(findUsersByIds).toHaveBeenCalledWith([12, 13]);
  });

  it('never exposes the email of the professors', async () => {
    const { uc } = build({
      courses: [course(7, '1001', 12)],
      findUsersByIds: jest.fn().mockResolvedValue([user(12, 'Laura', 'Gómez')]),
    });

    const { sections } = await uc.execute({ eventId: 1 });

    expect(JSON.stringify(sections)).not.toContain('@');
  });

  it('returns an empty list, without querying, for an event that does not require a course section', async () => {
    const { uc, listAcademicCoursesByTerm, findUsersByIds } = build({
      event: { id: 1, termId: 5, requiresCourse: false },
      courses: [course(7, '1001', 12)],
    });

    await expect(uc.execute({ eventId: 1 })).resolves.toEqual({ sections: [], professorsAvailable: true });
    expect(listAcademicCoursesByTerm).not.toHaveBeenCalled();
    expect(findUsersByIds).not.toHaveBeenCalled();
  });

  it.each([[-1], [0], [undefined]])('returns an empty list for an event without term (%s)', async (termId) => {
    const { uc, listAcademicCoursesByTerm } = build({ event: { id: 1, termId, requiresCourse: true } });

    await expect(uc.execute({ eventId: 1 })).resolves.toEqual({ sections: [], professorsAvailable: true });
    expect(listAcademicCoursesByTerm).not.toHaveBeenCalled();
  });

  it('returns an empty list for a term without sections, without asking auth-service', async () => {
    const { uc, findUsersByIds } = build({ courses: [] });

    await expect(uc.execute({ eventId: 1 })).resolves.toEqual({ sections: [], professorsAvailable: true });
    expect(findUsersByIds).not.toHaveBeenCalled();
  });

  it('rejects an event that event-service reports as NOT_FOUND', async () => {
    const { uc, getEventById } = build({});
    getEventById.mockRejectedValue(Object.assign(new Error('5 NOT_FOUND: Evento no encontrado'), { code: 5 }));

    await expect(uc.execute({ eventId: 99 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an event that does not exist', async () => {
    const { uc } = build({ event: null });

    await expect(uc.execute({ eventId: 99 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists a section whose professor account no longer exists without a professor, and it is not a failure', async () => {
    const { uc } = build({
      courses: [course(7, '1001', 12), course(8, '1002', 13)],
      findUsersByIds: jest.fn().mockResolvedValue([user(12, 'Laura', 'Gómez')]),
    });

    const result = await uc.execute({ eventId: 1 });

    expect(result.professorsAvailable).toBe(true);
    expect(result.sections.map((section) => section.professor?.firstName ?? null)).toEqual(['Laura', null]);
  });

  describe('when auth-service fails', () => {
    beforeEach(() => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('still lists the sections, without professors, and says the names are not available', async () => {
      const { uc } = build({
        courses: [course(7, '1001', 12), course(8, '1002', 13)],
        findUsersByIds: jest.fn().mockRejectedValue(new Error('auth-service no responde')),
      });

      await expect(uc.execute({ eventId: 1 })).resolves.toEqual({
        sections: [
          { id: 7, nrc: '1001', name: 'Curso 1001', professor: null },
          { id: 8, nrc: '1002', name: 'Curso 1002', professor: null },
        ],
        professorsAvailable: false,
      });
    });

    it('does not wait forever for auth-service', async () => {
      jest.useFakeTimers();
      try {
        const { uc } = build({
          courses: [course(7, '1001', 12)],
          findUsersByIds: jest.fn().mockReturnValue(new Promise(() => undefined)),
        });

        const pending = uc.execute({ eventId: 1 });
        await jest.advanceTimersByTimeAsync(PROFESSORS_LOOKUP_TIMEOUT_MS + 1);

        await expect(pending).resolves.toMatchObject({
          professorsAvailable: false,
          sections: [{ nrc: '1001', professor: null }],
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('does not hide a failure of event-service: without the event there is no term to list', async () => {
    const { uc, getEventById } = build({});
    getEventById.mockRejectedValue(new Error('event-service no responde'));

    await expect(uc.execute({ eventId: 1 })).rejects.toThrow('event-service no responde');
  });
});
