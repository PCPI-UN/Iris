import { of, throwError } from 'rxjs';
import { status } from '@grpc/grpc-js';
import { ProjectsController } from '../projects.controller';
import { ValidationError } from '../../../domain/errors';

interface CreateInput {
  eventId: number;
  courseId: number;
  name: string;
  state: string;
}

interface InvitationInput {
  email: string;
  eventType: string;
  targetType: string;
  targetId: number;
  roleIds: number[];
  firstName: string;
  lastName: string;
}

describe('ProjectsService.CreateProjectWithPendingParticipants', () => {
  const TUTORS = { userIds: [7], pending: [] };

  const PARTICIPANTS = [
    {
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'ana@uni.edu',
      studentCode: '2021123456',
      semester: '6',
      career: 'ing_sistemas',
    },
    {
      firstName: 'Luis',
      lastName: null,
      email: 'luis@uni.edu',
      studentCode: '2021654321',
      semester: '4',
      career: 'ing_sistemas',
    },
  ];

  const request = (overrides: Record<string, unknown> = {}) => ({
    eventId: 9,
    courseId: 3,
    name: 'Robot',
    projectCode: 'R-1',
    description: 'Un robot',
    eventType: 'FERIA',
    nrc: '1234',
    tutorUserIds: [7],
    pendingTutors: [],
    participants: PARTICIPANTS,
    documents: [{ url: 'https://blob/poster.png', type: 2 }],
    ...overrides,
  });

  const setup = (
    options: {
      tutorsInvalid?: boolean;
      conflictEmails?: string[];
      storeTutorsFails?: boolean;
      pendingFailsAt?: number;
      invitationFails?: boolean;
      documentFails?: boolean;
    } = {},
  ) => {
    // Order of the calls across all doubles, to check what runs before the project exists
    const calls: string[] = [];
    const track =
      <A extends unknown[], R>(name: string, impl: (...args: A) => R) =>
      (...args: A): R => {
        calls.push(name);
        return impl(...args);
      };
    const fail = (message: string) => Promise.reject(new Error(message));

    let pendingCount = 0;
    const doubles = {
      resolveTutors: jest.fn(
        track('resolveTutors', () =>
          options.tutorsInvalid
            ? Promise.reject(
                new ValidationError(
                  'Los usuarios 7 no son tutores ni profesores activos',
                ),
              )
            : Promise.resolve(TUTORS),
        ),
      ),
      storeTutors: jest.fn(
        track('storeTutors', () =>
          options.storeTutorsFails ? fail('tutors down') : Promise.resolve(),
        ),
      ),
      checkConflicts: jest.fn(
        track('checkConflicts', () =>
          Promise.resolve({
            hasConflict: (options.conflictEmails ?? []).length > 0,
            conflictEmails: options.conflictEmails ?? [],
          }),
        ),
      ),
      createProject: jest.fn(
        track('createProject', (input: CreateInput) =>
          Promise.resolve({
            id: 40,
            eventId: input.eventId,
            courseId: input.courseId,
            name: input.name,
            state: input.state,
          }),
        ),
      ),
      deleteProject: jest.fn(
        track('deleteProject', () => Promise.resolve(undefined)),
      ),
      addPending: jest.fn(
        track('addPending', (input: Record<string, unknown>) => {
          const index = pendingCount++;
          return options.pendingFailsAt === index
            ? fail('pending down')
            : Promise.resolve({ pendingId: 100 + index, ...input });
        }),
      ),
      createInvitation: jest.fn(
        track('createInvitation', (input: InvitationInput) =>
          options.invitationFails
            ? throwError(() => new Error('invitation down'))
            : of({ id: 'inv-1', email: input.email }),
        ),
      ),
      addDocument: jest.fn(
        track('addDocument', (input: Record<string, unknown>) =>
          options.documentFails
            ? fail('document down')
            : Promise.resolve({ id: 500, state: 'PENDING', ...input }),
        ),
      ),
      listTutors: jest.fn(
        track('listTutors', () =>
          Promise.resolve(
            new Map([[40, [{ userId: 7, email: 'tutor@uni.edu' }]]]),
          ),
        ),
      ),
    };

    const controller = Object.create(
      ProjectsController.prototype,
    ) as ProjectsController;
    Object.assign(controller, {
      setProjectTutorsUC: {
        resolve: doubles.resolveTutors,
        store: doubles.storeTutors,
      },
      checkActiveSubmissionByEmailsUC: { execute: doubles.checkConflicts },
      createProject: { execute: doubles.createProject },
      deleteProjectUC: { execute: doubles.deleteProject },
      addPendingParticipantUC: { execute: doubles.addPending },
      invitationService: { CreateInvitation: doubles.createInvitation },
      addDoc: { execute: doubles.addDocument },
      listProjectTutorsUC: { execute: doubles.listTutors },
    });

    const run = (req: Record<string, unknown>) =>
      controller.createProjectWithPendingParticipantsRpc(req);

    // What each invitation carries, independent of how it reaches invitation-service
    const invitationsSent = () =>
      doubles.createInvitation.mock.calls.map(([input]) => ({
        email: input.email,
        eventType: input.eventType,
        targetType: input.targetType,
        targetId: input.targetId,
        roleIds: input.roleIds,
        firstName: input.firstName,
        lastName: input.lastName,
      }));

    return { run, doubles, calls, invitationsSent };
  };

  it('validates the tutors before anything is created', async () => {
    const { run, doubles } = setup({ tutorsInvalid: true });

    await expect(run(request())).rejects.toBeInstanceOf(ValidationError);
    expect(doubles.resolveTutors).toHaveBeenCalledWith({
      tutorUserIds: [7],
      pendingTutors: [],
    });
    expect(doubles.createProject).not.toHaveBeenCalled();
  });

  it('rejects with ALREADY_EXISTS when a participant has an active project, and creates nothing', async () => {
    const { run, doubles } = setup({ conflictEmails: ['ana@uni.edu'] });

    await expect(run(request())).rejects.toMatchObject({
      error: {
        code: status.ALREADY_EXISTS,
        message: expect.stringContaining('ana@uni.edu') as unknown,
      },
    });
    expect(doubles.checkConflicts).toHaveBeenCalledWith({
      eventId: 9,
      emails: ['ana@uni.edu', 'luis@uni.edu'],
    });
    expect(doubles.createProject).not.toHaveBeenCalled();
  });

  it('creates the project under review, stores tutors and pendings, invites each pending and adds the documents', async () => {
    const { run, doubles, calls, invitationsSent } = setup();

    const res = await run(request());

    expect(calls.slice(0, 3)).toEqual([
      'resolveTutors',
      'checkConflicts',
      'createProject',
    ]);
    expect(doubles.createProject).toHaveBeenCalledWith({
      eventId: 9,
      courseId: 3,
      name: 'Robot',
      projectCode: 'R-1',
      description: 'Un robot',
      eventNumber: undefined,
      state: 'UNDER_REVIEW',
      nrc: '1234',
    });
    expect(doubles.storeTutors).toHaveBeenCalledWith(40, TUTORS);
    expect(doubles.addPending).toHaveBeenCalledTimes(2);
    expect(doubles.addPending).toHaveBeenNthCalledWith(2, {
      projectId: 40,
      firstName: 'Luis',
      lastName: undefined,
      email: 'luis@uni.edu',
      studentCode: '2021654321',
      semester: '4',
      career: 'ing_sistemas',
      status: 'PENDING',
    });
    expect(invitationsSent()).toEqual([
      {
        email: 'ana@uni.edu',
        eventType: 'FERIA',
        targetType: 'PROJECT',
        targetId: 40,
        roleIds: [5],
        firstName: 'Ana',
        lastName: 'Pérez',
      },
      {
        email: 'luis@uni.edu',
        eventType: 'FERIA',
        targetType: 'PROJECT',
        targetId: 40,
        roleIds: [5],
        firstName: 'Luis',
        lastName: '',
      },
    ]);
    expect(doubles.addDocument).toHaveBeenCalledWith({
      projectId: 40,
      url: 'https://blob/poster.png',
      type: 'POSTER',
    });
    expect(doubles.deleteProject).not.toHaveBeenCalled();
    expect(res).toMatchObject({
      project: { id: 40, eventId: 9, courseId: 3, name: 'Robot', state: 1 },
      participants: [
        { pendingId: 100, email: 'ana@uni.edu', status: 1 },
        { pendingId: 101, email: 'luis@uni.edu', status: 1, lastName: '' },
      ],
      documents: [{ id: 500, projectId: 40, url: 'https://blob/poster.png' }],
      tutors: [{ userId: 7, email: 'tutor@uni.edu' }],
    });
  });

  it('deletes the project when storing the tutors fails', async () => {
    const { run, doubles } = setup({ storeTutorsFails: true });

    await expect(run(request())).rejects.toThrow('tutors down');
    expect(doubles.deleteProject).toHaveBeenCalledWith({ id: 40 });
    expect(doubles.addPending).not.toHaveBeenCalled();
  });

  it('deletes the project when a pending participant cannot be stored', async () => {
    const { run, doubles } = setup({ pendingFailsAt: 1 });

    await expect(run(request())).rejects.toThrow('pending down');
    expect(doubles.deleteProject).toHaveBeenCalledWith({ id: 40 });
    expect(doubles.createInvitation).not.toHaveBeenCalled();
  });

  it('keeps the project when an invitation fails: the error goes out and nothing is deleted', async () => {
    const { run, doubles } = setup({ invitationFails: true });

    await expect(run(request())).rejects.toThrow('invitation down');
    expect(doubles.deleteProject).not.toHaveBeenCalled();
    expect(doubles.addDocument).not.toHaveBeenCalled();
  });

  it('keeps the project when a document cannot be added', async () => {
    const { run, doubles } = setup({ documentFails: true });

    await expect(run(request())).rejects.toThrow('document down');
    expect(doubles.deleteProject).not.toHaveBeenCalled();
  });

  it('without participants checks no conflicts and sends no invitations', async () => {
    const { run, doubles } = setup();

    const res = await run(request({ participants: [], documents: [] }));

    expect(doubles.checkConflicts).not.toHaveBeenCalled();
    expect(doubles.addPending).not.toHaveBeenCalled();
    expect(doubles.createInvitation).not.toHaveBeenCalled();
    expect(res).toMatchObject({ participants: [], documents: [] });
  });
});
