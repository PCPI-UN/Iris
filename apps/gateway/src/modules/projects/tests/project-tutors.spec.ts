import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { of } from 'rxjs';
import { ProjectsService } from '../projects.service';
import { ProjectsController } from '../projects.controller';
import { parseProjectTutors } from '../parse-project-tutors';
import { ProjectTutorsInputDto } from '../dto/project-tutors-input.dto';
import { TutorCandidatesQueryDto } from '../dto/tutor-candidates-query.dto';

describe('parseProjectTutors (tutors field of POST /projects)', () => {
  it('a missing field means no tutors', () => {
    expect(parseProjectTutors(undefined)).toMatchObject({
      userIds: [],
      pending: [],
    });
  });

  it('reads linked and pending tutors', () => {
    const tutors = parseProjectTutors(
      JSON.stringify({
        userIds: [12],
        pending: [{ firstName: 'Laura', email: 'laura@uni.edu' }],
      }),
    );
    expect(tutors.userIds).toEqual([12]);
    expect(tutors.pending).toEqual([
      { firstName: 'Laura', email: 'laura@uni.edu' },
    ]);
  });

  it.each([
    ['not JSON', '{tutors'],
    ['an array', '[1,2]'],
    [
      'a pending tutor with a bad email',
      '{"pending":[{"firstName":"A","email":"x"}]}',
    ],
    ['a pending tutor without name', '{"pending":[{"email":"a@b.co"}]}'],
    ['ids that are not integers', '{"userIds":["a"]}'],
    ['repeated ids', '{"userIds":[3,3]}'],
  ])('answers 400 for %s', (_label, raw) => {
    expect(() => parseProjectTutors(raw)).toThrow(BadRequestException);
  });
});

describe('TutorCandidatesQueryDto', () => {
  const errorsOf = (search: unknown) =>
    validate(plainToInstance(TutorCandidatesQueryDto, { search }));

  it('rejects a search with fewer than 3 letters or none', async () => {
    expect(await errorsOf('la')).toHaveLength(1);
    expect(await errorsOf(undefined)).toHaveLength(1);
  });

  it('accepts 3 letters', async () => {
    expect(await errorsOf('lau')).toHaveLength(0);
  });
});

describe('Project tutors in the gateway service', () => {
  const buildService = () => {
    const service = Object.create(ProjectsService.prototype) as ProjectsService;
    const auth = {
      findUsersByRoles: jest.fn().mockResolvedValue({
        users: [
          { id: 5, firstName: 'Laura', lastName: 'Gómez', roleIds: [10] },
        ],
      }),
    };
    const grpc = {
      setProjectTutors: jest.fn(() => of({ tutors: [] })),
      getProjectComplete: jest.fn(() =>
        of({
          items: [
            {
              id: 3,
              name: 'P',
              participants: [],
              pendingParticipants: [],
              documents: [],
              tutors: [{ userId: 5, firstName: 'Laura', pending: false }],
            },
          ],
        }),
      ),
    };
    Object.assign(service, { authService: auth, projectsService: grpc });
    return { service, auth, grpc };
  };

  it('searches Professor and Tutor users and returns id and name only', async () => {
    const { service, auth } = buildService();
    const result = await service.searchTutorCandidates(' lau ');
    expect(auth.findUsersByRoles).toHaveBeenCalledWith({
      roleIds: [9, 10],
      search: 'lau',
      userIds: [],
    });
    expect(result).toEqual([{ id: 5, firstName: 'Laura', lastName: 'Gómez' }]);
  });

  it('replaces the tutors of a project', async () => {
    const { service, grpc } = buildService();
    const dto = plainToInstance(ProjectTutorsInputDto, {
      userIds: [5],
      pending: [{ firstName: 'Ana', email: 'ana@uni.edu' }],
    });
    await service.setProjectTutors(3, dto);
    expect(grpc.setProjectTutors).toHaveBeenCalledWith({
      projectId: 3,
      tutorUserIds: [5],
      pendingTutors: [{ firstName: 'Ana', email: 'ana@uni.edu' }],
    });
  });

  it('puts the tutors beside the participants in the review response, not inside project', async () => {
    const { service } = buildService();
    const review = await service.getProjectForReview(3);
    expect(review.tutors).toEqual([
      { userId: 5, firstName: 'Laura', pending: false },
    ]);
    expect(review.project).not.toHaveProperty('tutors');
  });

  it('sends the tutors of the submission to project-service', async () => {
    const { service, grpc } = buildService();
    const create = jest.fn(() => of({ project: { id: 9 } }));
    Object.assign(grpc, { createProjectWithPendingParticipants: create });
    Object.assign(service, { logger: { log: jest.fn(), error: jest.fn() } });

    await service.createProjectWithParticipantsAndFiles(
      {
        eventId: '1',
        eventType: 'Competition',
        courseId: '2',
        name: 'P',
        tutors: JSON.stringify({
          userIds: [5],
          pending: [{ firstName: 'Ana', email: 'ana@uni.edu' }],
        }),
      },
      [],
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tutorUserIds: [5],
        pendingTutors: [{ firstName: 'Ana', email: 'ana@uni.edu' }],
      }),
    );
  });

  it('the controller delegates both endpoints', async () => {
    const { service } = buildService();
    const controller = new ProjectsController(service);
    await expect(
      controller.searchTutorCandidates({ search: 'lau' }),
    ).resolves.toHaveLength(1);
    await expect(
      controller.setProjectTutors(
        3,
        plainToInstance(ProjectTutorsInputDto, { userIds: [5] }),
      ),
    ).resolves.toEqual({ tutors: [] });
  });
});
