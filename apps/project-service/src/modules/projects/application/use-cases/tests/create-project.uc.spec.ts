import { CreateProjectUC } from '../create-project.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { EventServicePort } from '../../ports/event-service.port';
import { ValidationError } from '../../../domain/errors';
import { EventResultsPublishedError } from '../../../domain/admin-project-creation';

describe('CreateProjectUC: course section (NRC) of the project', () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const input = { eventId: 4, courseId: 2, name: ' EcoVision ', nrc: ' 1001 ' };
  let repo: any;
  let events: any;

  beforeEach(() => {
    repo = {
      findProject: jest.fn().mockResolvedValue(null),
      findAcademicCourseId: jest.fn().mockResolvedValue(12),
      create: jest.fn(async (data) => ({ id: 1, ...data })),
    };
    events = {
      getEventById: jest.fn().mockResolvedValue({
        id: 4,
        active: true,
        isPubliclyJoinable: true,
        inscriptionDeadline: tomorrow,
        termId: 3,
        requiresCourse: true,
      }),
      getCourseById: jest.fn().mockResolvedValue({ id: 2, eventId: 4 }),
    };
  });

  const build = () => new CreateProjectUC(repo, events);

  it('looks the NRC up in the term of the event and stores its course section', async () => {
    await build().execute(input);

    expect(repo.findAcademicCourseId).toHaveBeenCalledWith(3, '1001');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'EcoVision', academicCourseId: 12 }),
    );
  });

  it.each([
    ['no NRC', { nrc: '  ' }, {}],
    ['an event without term (-1)', {}, { termId: -1 }],
    ['an event without termId', {}, { termId: undefined }],
  ])('rejects %s', async (_case, inputChange, eventChange) => {
    events.getEventById.mockResolvedValue({
      ...(await events.getEventById()),
      ...eventChange,
    });

    await expect(
      build().execute({ ...input, ...inputChange }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['an NRC that is not in the term', null],
    ['course section -1', -1],
    [
      'course section 0 ("not applicable") in an event that requires a course',
      0,
    ],
  ])('rejects %s', async (_case, courseId) => {
    repo.findAcademicCourseId.mockResolvedValue(courseId);

    await expect(build().execute(input)).rejects.toThrow(
      'El NRC 1001 no existe en el periodo del evento',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  describe('event that does not require a course section (requiresCourse = false)', () => {
    beforeEach(async () => {
      events.getEventById.mockResolvedValue({
        ...(await events.getEventById()),
        requiresCourse: false,
        termId: -1,
      });
    });

    it.each([
      ['without NRC', undefined],
      ['ignoring an NRC the student sent', '1001'],
    ])('gives course section 0 %s', async (_case, nrc) => {
      await build().execute({ ...input, nrc });

      expect(repo.findAcademicCourseId).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ academicCourseId: 0 }),
      );
    });
  });

  it('treats an event that does not say whether it requires a course as requiring one', async () => {
    events.getEventById.mockResolvedValue({
      ...(await events.getEventById()),
      requiresCourse: undefined,
    });

    await expect(
      build().execute({ ...input, nrc: undefined }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('CreateProjectUC: inscription deadline in Bogotá time', () => {
  // Deadline as event-service stores "21 Nov 2026": 00:00 in Bogotá = 05:00 UTC
  const deadline = '2026-11-21T05:00:00.000Z';
  let repo: any;
  let events: any;

  beforeEach(() => {
    repo = {
      findProject: jest.fn().mockResolvedValue(null),
      findAcademicCourseId: jest.fn().mockResolvedValue(12),
      create: jest.fn(async (data) => ({ id: 1, ...data })),
    };
    events = {
      getEventById: jest.fn().mockResolvedValue({
        id: 4,
        active: true,
        isPubliclyJoinable: true,
        inscriptionDeadline: deadline,
        termId: 3,
        requiresCourse: true,
      }),
      getCourseById: jest.fn().mockResolvedValue({ id: 2, eventId: 4 }),
    };
    jest.useFakeTimers();
  });

  afterEach(() => jest.useRealTimers());

  const register = () =>
    new CreateProjectUC(repo, events).execute({
      eventId: 4,
      courseId: 2,
      name: 'EcoVision',
      nrc: '1001',
    });

  // These run the same on a server in UTC (production containers) and on a PC in Colombia
  it.each([
    [
      '7:00 PM in Bogotá of the deadline day (midnight UTC)',
      '2026-11-22T00:00:00.000Z',
    ],
    ['11:30 PM in Bogotá of the deadline day', '2026-11-22T04:30:00.000Z'],
  ])('accepts a registration at %s', async (_case, now) => {
    jest.setSystemTime(new Date(now));

    await expect(register()).resolves.toEqual(
      expect.objectContaining({ id: 1 }),
    );
  });

  it('rejects a registration at 00:00 in Bogotá of the next day', async () => {
    jest.setSystemTime(new Date('2026-11-22T05:00:00.000Z'));

    await expect(register()).rejects.toThrow(
      'La fecha límite de inscripción del evento ya pasó',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('CreateProjectUC: administrative creation', () => {
  const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const input = { eventId: 4, courseId: 2, name: 'EcoVision', nrc: '1001' };
  const openEvent = {
    id: 4,
    active: true,
    isPubliclyJoinable: true,
    inscriptionDeadline: tomorrow,
    termId: 3,
    requiresCourse: true,
    resultsPublished: false,
  };

  const build = (eventChange: Record<string, unknown> = {}, nrcId = 12) => {
    const repo = {
      findProject: jest.fn().mockResolvedValue(null),
      findAcademicCourseId: jest.fn().mockResolvedValue(nrcId),
      create: jest.fn((data: Record<string, unknown>) =>
        Promise.resolve({ id: 1, ...data }),
      ),
    };
    const events = {
      getEventById: jest
        .fn()
        .mockResolvedValue({ ...openEvent, ...eventChange }),
      getCourseById: jest.fn().mockResolvedValue({ id: 2, eventId: 4 }),
    };
    return {
      uc: new CreateProjectUC(
        repo as unknown as ProjectRepository,
        events as unknown as EventServicePort,
      ),
      repo,
    };
  };

  it.each([
    [
      'the inscription deadline passed',
      { inscriptionDeadline: yesterday },
      'La fecha límite de inscripción del evento ya pasó',
    ],
    [
      'the event is not publicly joinable',
      { isPubliclyJoinable: false },
      'El evento no permite inscripción pública',
    ],
  ])(
    'when %s, rejects the public submission and creates the administrative one',
    async (_case, eventChange, message) => {
      const pub = build(eventChange);
      await expect(pub.uc.execute(input)).rejects.toThrow(message);
      expect(pub.repo.create).not.toHaveBeenCalled();

      const admin = build(eventChange);
      await expect(
        admin.uc.execute(input, { administrative: true }),
      ).resolves.toEqual(
        expect.objectContaining({ id: 1, academicCourseId: 12 }),
      );
    },
  );

  it('rejects the administrative creation in an event with published results', async () => {
    const { uc, repo } = build({ resultsPublished: true });

    await expect(
      uc.execute(input, { administrative: true }),
    ).rejects.toBeInstanceOf(EventResultsPublishedError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['public', {}],
    ['administrative', { administrative: true }],
  ])('rejects an NRC that is not in the term (%s)', async (_case, opts) => {
    const { uc, repo } = build({}, null as unknown as number);

    await expect(uc.execute(input, opts)).rejects.toThrow(
      'El NRC 1001 no existe en el periodo del evento',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects the administrative creation in an inactive event', async () => {
    const { uc, repo } = build({ active: false });

    await expect(uc.execute(input, { administrative: true })).rejects.toThrow(
      'El evento está inactivo',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });
});
