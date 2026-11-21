import { CreateProjectUC } from '../create-project.uc';
import { ValidationError } from '../../../domain/errors';

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
        id: 4, active: true, isPubliclyJoinable: true, inscriptionDeadline: tomorrow, termId: 3, requiresCourse: true,
      }),
      getCourseById: jest.fn().mockResolvedValue({ id: 2, eventId: 4 }),
    };
  });

  const build = () => new CreateProjectUC(repo, events);

  it('looks the NRC up in the term of the event and stores its course section', async () => {
    await build().execute(input);

    expect(repo.findAcademicCourseId).toHaveBeenCalledWith(3, '1001');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'EcoVision', academicCourseId: 12 }));
  });

  it.each([
    ['no NRC', { nrc: '  ' }, {}],
    ['an event without term (-1)', {}, { termId: -1 }],
    ['an event without termId', {}, { termId: undefined }],
  ])('rejects %s', async (_case, inputChange, eventChange) => {
    events.getEventById.mockResolvedValue({ ...(await events.getEventById()), ...eventChange });

    await expect(build().execute({ ...input, ...inputChange })).rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    ['an NRC that is not in the term', null],
    ['course section -1', -1],
    ['course section 0 ("not applicable") in an event that requires a course', 0],
  ])('rejects %s', async (_case, courseId) => {
    repo.findAcademicCourseId.mockResolvedValue(courseId);

    await expect(build().execute(input)).rejects.toThrow('El NRC 1001 no existe en el periodo del evento');
    expect(repo.create).not.toHaveBeenCalled();
  });

  describe('event that does not require a course section (requiresCourse = false)', () => {
    beforeEach(async () => {
      events.getEventById.mockResolvedValue({ ...(await events.getEventById()), requiresCourse: false, termId: -1 });
    });

    it.each([
      ['without NRC', undefined],
      ['ignoring an NRC the student sent', '1001'],
    ])('gives course section 0 %s', async (_case, nrc) => {
      await build().execute({ ...input, nrc });

      expect(repo.findAcademicCourseId).not.toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ academicCourseId: 0 }));
    });
  });

  it('treats an event that does not say whether it requires a course as requiring one', async () => {
    events.getEventById.mockResolvedValue({ ...(await events.getEventById()), requiresCourse: undefined });

    await expect(build().execute({ ...input, nrc: undefined })).rejects.toBeInstanceOf(ValidationError);
  });
});
