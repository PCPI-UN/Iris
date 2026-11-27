import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import {
  AdminCreateProjectInput,
  AdminCreateProjectUC,
} from '../admin-create-project.uc';
import { CreateProjectUC } from '../create-project.uc';
import { SetProjectTutorsUC } from '../set-project-tutors.uc';
import { CheckActiveSubmissionByEmailsUC } from '../check-active-submission-by-emails.uc';
import { ProjectEnrollmentService } from '../../services/project-enrollment.service';
import { ProjectApprovalEffects } from '../../services/project-approval-effects.service';
import { AuthServicePort } from '../../ports/auth-service.port';
import { EventServicePort } from '../../ports/event-service.port';
import { InvitationCommandPort } from '../../ports/invitation.command-port';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { ProjectChangeLogRepository } from '../../../domain/repositories/project-change-log.repository';
import { participantHasActiveProject } from '../../../domain/admin-participants';
import { ParticipantInOtherProjectError } from '../../../domain/admin-project-creation';
import { ValidationError } from '../../../domain/errors';

describe('AdminCreateProjectUC', () => {
  const ANA = {
    firstName: 'Ana',
    lastName: 'Pérez',
    email: ' Ana@Uni.edu ',
    studentCode: '2021123456',
    semester: '6',
    career: 'ing_sistemas',
  };
  const LUIS = {
    firstName: 'Luis',
    email: 'luis@uni.edu',
    studentCode: '2021654321',
    semester: '4',
    career: 'ing_sistemas',
  };

  const input = (
    change: Partial<AdminCreateProjectInput> = {},
  ): AdminCreateProjectInput => ({
    eventId: 9,
    courseId: 3,
    name: 'Robot',
    nrc: '1001',
    actingUserId: 1,
    tutorUserIds: [7],
    participants: [ANA, LUIS],
    origin: { kind: 'ADMIN_FORM' },
    ...change,
  });

  const setup = (
    options: {
      conflicts?: { email: string; projectId: number }[];
      emailFails?: boolean;
      activationFails?: boolean;
      lockedConflict?: boolean;
      invitationFails?: boolean;
    } = {},
  ) => {
    // Records which writes ran inside UnitOfWork.run
    const inTransaction: string[] = [];
    let open = false;
    const uow = {
      run: jest.fn(async (work: () => Promise<unknown>) => {
        open = true;
        try {
          return await work();
        } finally {
          open = false;
        }
      }),
    };
    const mark = (name: string) => {
      if (open) inTransaction.push(name);
    };

    const createProject = {
      execute: jest.fn((data: { state: string }) => {
        mark('createProject');
        return Promise.resolve({
          id: 40,
          eventId: 9,
          courseId: 3,
          name: 'Robot',
          projectCode: null,
          state: data.state,
        });
      }),
    };
    const tutors = {
      resolve: jest.fn().mockResolvedValue({
        userIds: [7],
        pendings: [{ firstName: 'T', email: 'tutor@uni.edu' }],
      }),
      store: jest.fn(() => {
        mark('storeTutors');
        return Promise.resolve();
      }),
    };
    const enrollment = new ProjectEnrollmentService(
      null as unknown as ProjectRepository,
      null as never,
      null as never,
      null as never,
    );
    const enroll = jest
      .spyOn(enrollment, 'enroll')
      .mockImplementation((_project, student) => {
        mark('enroll');
        return Promise.resolve({
          userId: student.userId,
          projectId: 40,
          studentCode: student.studentCode,
        });
      });
    const addPending = jest
      .spyOn(enrollment, 'addPending')
      .mockImplementation((project, student) => {
        mark('addPending');
        if (options.lockedConflict) {
          return Promise.reject(participantHasActiveProject(student.email, 12));
        }
        return Promise.resolve({
          pending: {
            pendingId: 100,
            projectId: 40,
            ...student,
            status: 'PENDING' as const,
          },
          project,
        });
      });
    const activeSubmissions = {
      execute: jest.fn().mockResolvedValue({
        hasConflict: Boolean(options.conflicts?.length),
        conflictEmails: (options.conflicts ?? []).map((c) => c.email),
        conflicts: options.conflicts ?? [],
      }),
    };
    // Ana has an account, Luis does not
    const auth = {
      findUserByEmail: jest.fn((email: string) =>
        Promise.resolve(email === 'ana@uni.edu' ? { id: 21, email } : null),
      ),
    };
    const events = {
      getEventById: jest.fn().mockResolvedValue({ id: 9, eventType: 1 }),
    };
    const effects = {
      activateTutors: jest.fn(() =>
        options.activationFails
          ? Promise.reject(new Error('auth down'))
          : Promise.resolve(),
      ),
      notifyPendingParticipant: jest.fn(() =>
        Promise.resolve(!options.emailFails),
      ),
    };
    const repo = {
      markPendingsInvited: jest.fn().mockResolvedValue(undefined),
    };
    const changeLog = {
      create: jest.fn(() => {
        mark('changeLog');
        return Promise.resolve();
      }),
    };

    const invitations = {
      createInvitation: jest.fn(() =>
        options.invitationFails
          ? Promise.reject(new Error('invitation-service down'))
          : Promise.resolve({ created: true }),
      ),
    };

    const uc = new AdminCreateProjectUC(
      repo as unknown as ProjectRepository,
      createProject as unknown as CreateProjectUC,
      tutors as unknown as SetProjectTutorsUC,
      enrollment,
      activeSubmissions as unknown as CheckActiveSubmissionByEmailsUC,
      auth as unknown as AuthServicePort,
      events as unknown as EventServicePort,
      effects as unknown as ProjectApprovalEffects,
      changeLog as unknown as ProjectChangeLogRepository,
      uow as unknown as UnitOfWork,
      invitations as unknown as InvitationCommandPort,
    );
    return {
      invitations,
      uc,
      uow,
      inTransaction,
      createProject,
      tutors,
      enroll,
      addPending,
      effects,
      repo,
      changeLog,
    };
  };

  it('creates APPROVED by default: saves everything in one transaction, activates the tutors and invites the pending participants', async () => {
    const t = setup();

    const res = await t.uc.execute(input());

    expect(t.createProject.execute).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 9, name: 'Robot', state: 'APPROVED' }),
      { administrative: true },
    );
    expect(t.inTransaction).toEqual([
      'createProject',
      'storeTutors',
      'enroll',
      'addPending',
      'changeLog',
    ]);
    expect(t.enroll).toHaveBeenCalledWith(expect.objectContaining({ id: 40 }), {
      userId: 21,
      studentCode: '2021123456',
      email: 'ana@uni.edu',
    });
    expect(t.invitations.createInvitation).toHaveBeenCalledTimes(1);
    expect(t.invitations.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'luis@uni.edu',
        targetType: 'PROJECT',
        targetId: 40,
        roleIds: [5],
        eventType: 'Exposition',
      }),
    );
    expect(t.effects.activateTutors).toHaveBeenCalledWith(40, 'Exposition');
    expect(t.effects.notifyPendingParticipant).toHaveBeenCalledTimes(1);
    expect(t.repo.markPendingsInvited).toHaveBeenCalledWith(
      40,
      ['luis@uni.edu'],
      expect.any(Date),
    );
    expect(res).toEqual({
      project: expect.objectContaining({
        id: 40,
        state: 'APPROVED',
      }) as unknown,
      participants: [
        { email: 'ana@uni.edu', status: 'JOINED' },
        { email: 'luis@uni.edu', status: 'INVITED' },
      ],
      failedEffects: [],
      warning: null,
    });
  });

  it('created UNDER_REVIEW, invites the pending participants but neither activates the tutors nor sends the approval email', async () => {
    const t = setup();

    const res = await t.uc.execute(input({ state: 'UNDER_REVIEW' }));

    expect(t.invitations.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'luis@uni.edu', targetId: 40 }),
    );
    expect(t.effects.activateTutors).not.toHaveBeenCalled();
    expect(t.effects.notifyPendingParticipant).not.toHaveBeenCalled();
    expect(res.participants).toEqual([
      { email: 'ana@uni.edu', status: 'JOINED' },
      { email: 'luis@uni.edu', status: 'PENDING' },
    ]);
  });

  it('rejects with every conflicting email and saves nothing', async () => {
    const t = setup({
      conflicts: [
        { email: 'luis@uni.edu', projectId: 12 },
        { email: 'ana@uni.edu', projectId: 13 },
      ],
    });

    const error = await t.uc.execute(input()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ParticipantInOtherProjectError);
    expect((error as ParticipantInOtherProjectError).emails).toEqual([
      'ana@uni.edu',
      'luis@uni.edu',
    ]);
    expect(t.uow.run).not.toHaveBeenCalled();
  });

  it('answers the conflict found under the locks the same way', async () => {
    const t = setup({ lockedConflict: true });

    const error = await t.uc.execute(input()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ParticipantInOtherProjectError);
    expect((error as ParticipantInOtherProjectError).emails).toEqual([
      'luis@uni.edu',
    ]);
    expect(t.changeLog.create).not.toHaveBeenCalled();
  });

  it('keeps the project when the email fails and reports NOTIFICATION', async () => {
    const t = setup({ emailFails: true });

    const res = await t.uc.execute(input());

    expect(t.changeLog.create).toHaveBeenCalled();
    expect(t.repo.markPendingsInvited).not.toHaveBeenCalled();
    expect(res.failedEffects).toEqual(['NOTIFICATION']);
    expect(res.warning).toContain('correos');
    expect(res.participants[1]).toEqual({
      email: 'luis@uni.edu',
      status: 'PENDING',
    });
  });

  it('keeps the project when an invitation fails and reports INVITATION', async () => {
    const t = setup({ invitationFails: true });

    const res = await t.uc.execute(input({ actingUserId: 5 }));

    expect(t.invitations.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ requestedByUserId: 5 }),
    );
    expect(t.changeLog.create).toHaveBeenCalled();
    expect(res.failedEffects).toEqual(['INVITATION']);
    expect(res.warning).toContain('invitar');
  });

  it('reports TUTOR_ACTIVATION when the activation fails', async () => {
    const t = setup({ activationFails: true });

    const res = await t.uc.execute(input());

    expect(res.failedEffects).toEqual(['TUTOR_ACTIVATION']);
    expect(res.warning).toContain('tutores');
  });

  it('records CREATED with the acting admin, an empty before and the initial values', async () => {
    const t = setup();

    await t.uc.execute(
      input({
        actingUserId: 5,
        origin: { kind: 'ADMIN_BULK', fileName: 'feria.xlsx', rowNumber: 4 },
      }),
    );

    expect(t.changeLog.create).toHaveBeenCalledWith({
      projectId: 40,
      actorUserId: 5,
      action: 'CREATED',
      before: {},
      after: {
        name: 'Robot',
        courseId: 3,
        nrc: '1001',
        projectCode: null,
        state: 'APPROVED',
        participants: ['ana@uni.edu', 'luis@uni.edu'],
        tutors: { userIds: [7], emails: ['tutor@uni.edu'] },
        origin: { kind: 'ADMIN_BULK', fileName: 'feria.xlsx', rowNumber: 4 },
      },
      reason: null,
    });
  });

  it.each([
    ['no participants', { participants: [] }],
    [
      'a repeated email',
      { participants: [ANA, { ...LUIS, email: 'ana@uni.edu' }] },
    ],
    [
      'a repeated student code',
      { participants: [ANA, { ...LUIS, studentCode: '2021123456' }] },
    ],
    [
      'a state other than APPROVED or UNDER_REVIEW',
      { state: 'REJECTED' as never },
    ],
  ])('rejects %s before anything is read or saved', async (_case, change) => {
    const t = setup();

    await expect(t.uc.execute(input(change))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(t.tutors.resolve).not.toHaveBeenCalled();
    expect(t.uow.run).not.toHaveBeenCalled();
  });
});
