import { EmailTemplate } from '@app/common/generated/notification';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import {
  AdminAddParticipantUC,
  INVITATION_FAILED_WARNING,
  INVITED_NOT_MARKED_WARNING,
} from '../admin-add-participant.uc';
import { AddParticipantUC } from '../add-participant.uc';
import { AddPendingParticipantUC } from '../add-pending-participant.us';
import { CheckActiveSubmissionByEmailsUC } from '../check-active-submission-by-emails.uc';
import { SetProjectTutorsUC } from '../set-project-tutors.uc';
import { ProjectApprovalEffects } from '../../services/project-approval-effects.service';
import { AdminParticipantsError } from '../../../domain/admin-participants';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import {
  PendingProjectParticipant,
  Project,
  ProjectState,
} from '../../../domain/entities/project.entity';

describe('AdminAddParticipantUC', () => {
  const PENDING = {
    firstName: ' Ana ',
    lastName: 'Pérez',
    email: ' Ana@Uni.edu ',
    studentCode: '2021123456',
    semester: '6',
    career: 'ing_sistemas',
  };

  const setup = (
    options: {
      state?: ProjectState;
      conflicts?: { email: string; projectId: number }[];
      pendings?: PendingProjectParticipant[];
      participants?: {
        userId: number;
        projectId: number;
        studentCode: string;
      }[];
      account?: { id: number; email: string; firstName: string } | null;
      enrolledIn?: Project[];
      emailFails?: boolean;
    } = {},
  ) => {
    const project: Project = {
      id: 4,
      eventId: 9,
      courseId: 3,
      name: 'Robot',
      state: options.state ?? 'UNDER_REVIEW',
    };
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
    const repo = {
      findById: jest.fn().mockResolvedValue(project),
      lockProject: jest.fn(() => {
        if (open) inTransaction.push('lock');
        return Promise.resolve();
      }),
      lockStudentInEvent: jest.fn(() => {
        if (open) inTransaction.push('lockStudent');
        return Promise.resolve();
      }),
      listParticipants: jest.fn().mockResolvedValue(options.participants ?? []),
      listPendingParticipants: jest
        .fn()
        .mockResolvedValue(options.pendings ?? []),
      listProjectsByParticipant: jest
        .fn()
        .mockResolvedValue(options.enrolledIn ?? []),
      addParticipant: jest.fn((input: object) => {
        if (open) inTransaction.push('participant');
        return Promise.resolve(input);
      }),
      markPendingJoined: jest.fn().mockResolvedValue(false),
      addPendingParticipant: jest.fn((input: object) => {
        if (open) inTransaction.push('pending');
        return Promise.resolve({ pendingId: 11, ...input });
      }),
      markPendingsInvited: jest.fn().mockResolvedValue(1),
    };
    const changeLog = {
      create: jest.fn((entry: object) => {
        if (open) inTransaction.push('changeLog');
        return Promise.resolve({ id: 1, createdAt: new Date(), ...entry });
      }),
      listByProject: jest.fn(),
    };
    const activeSubmissions = {
      execute: jest.fn(() => {
        if (open) inTransaction.push('check');
        return Promise.resolve({
          hasConflict: Boolean(options.conflicts?.length),
          conflictEmails: (options.conflicts ?? []).map((c) => c.email),
          conflicts: options.conflicts ?? [],
        });
      }),
    };
    const auth = {
      findUsersByIds: jest
        .fn()
        .mockResolvedValue(options.account ? [options.account] : []),
      findUserByEmail: jest.fn().mockResolvedValue(options.account ?? null),
    };
    const events = {
      getEventById: jest.fn().mockResolvedValue({ id: 9, eventType: 2 }),
    };
    const notifications = {
      sendEmail: options.emailFails
        ? jest.fn().mockRejectedValue(new Error('smtp down'))
        : jest.fn().mockResolvedValue({ success: true }),
    };
    const effects = new ProjectApprovalEffects(
      repo as any,
      notifications,
      {} as SetProjectTutorsUC,
    );
    const uc = new AdminAddParticipantUC(
      repo as any,
      new AddParticipantUC(repo as any),
      new AddPendingParticipantUC(repo as any),
      activeSubmissions as unknown as CheckActiveSubmissionByEmailsUC,
      auth as any,
      events as any,
      effects,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    return {
      uc,
      repo,
      changeLog,
      inTransaction,
      notifications,
      activeSubmissions,
    };
  };

  const base = {
    projectId: 4,
    actingUserId: 1,
    reason: 'Faltaba en la inscripción',
  };

  beforeEach(() =>
    jest.spyOn(console, 'error').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  describe('pending participant', () => {
    it('on an UNDER_REVIEW project is added as PENDING, without email, and recorded', async () => {
      const { uc, repo, changeLog, inTransaction, notifications } = setup();

      const result = await uc.execute({ ...base, pending: PENDING });

      expect(repo.addPendingParticipant).toHaveBeenCalledWith({
        projectId: 4,
        firstName: 'Ana',
        lastName: 'Pérez',
        email: 'ana@uni.edu',
        studentCode: '2021123456',
        semester: '6',
        career: 'ing_sistemas',
        status: 'PENDING',
      });
      expect(result).toMatchObject({
        pendingParticipant: { pendingId: 11, status: 'PENDING' },
        failedEffects: [],
        warning: null,
      });
      expect(notifications.sendEmail).not.toHaveBeenCalled();
      expect(repo.markPendingsInvited).not.toHaveBeenCalled();
      expect(changeLog.create).toHaveBeenCalledWith({
        projectId: 4,
        actorUserId: 1,
        action: 'PARTICIPANTS',
        before: { participant: null },
        after: {
          participant: {
            type: 'PENDING',
            pendingId: 11,
            firstName: 'Ana',
            lastName: 'Pérez',
            email: 'ana@uni.edu',
            studentCode: '2021123456',
            semester: '6',
            career: 'ing_sistemas',
          },
        },
        reason: 'Faltaba en la inscripción',
      });
      // Locked, checked, saved and recorded in the same transaction
      expect(inTransaction).toEqual([
        'lock',
        'lockStudent',
        'check',
        'pending',
        'changeLog',
      ]);
      expect(repo.lockStudentInEvent).toHaveBeenCalledWith(9, 'ana@uni.edu');
    });

    it('on an APPROVED project gets the approval email and becomes INVITED', async () => {
      const { uc, repo, notifications } = setup({ state: 'APPROVED' });

      const result = await uc.execute({ ...base, pending: PENDING });

      // Competition event (eventType 2): the template of the normal approval
      expect(notifications.sendEmail).toHaveBeenCalledWith({
        to: 'ana@uni.edu',
        template: EmailTemplate.PARTICIPANTS_APPROVED,
        params: { firstName: 'Ana', lastName: 'Pérez', projectName: 'Robot' },
      });
      expect(repo.markPendingsInvited).toHaveBeenCalledWith(
        4,
        ['ana@uni.edu'],
        expect.any(Date),
      );
      expect(result).toMatchObject({
        pendingParticipant: {
          status: 'INVITED',
          invitedAt: expect.any(Date) as unknown,
        },
        failedEffects: [],
        warning: null,
      });
    });

    it('reads the state under the lock: a project approved in between sends the invitation', async () => {
      const { uc, repo, notifications } = setup();
      // UNDER_REVIEW when first read, APPROVED once the locks are taken
      repo.findById
        .mockResolvedValueOnce({
          id: 4,
          eventId: 9,
          courseId: 3,
          name: 'Robot',
          state: 'UNDER_REVIEW',
        })
        .mockResolvedValueOnce({
          id: 4,
          eventId: 9,
          courseId: 3,
          name: 'Robot',
          state: 'APPROVED',
        });

      const result = await uc.execute({ ...base, pending: PENDING });

      expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
      expect(result.pendingParticipant?.status).toBe('INVITED');
    });

    it('does not say the email failed when only marking it as invited failed', async () => {
      const { uc, repo, notifications } = setup({ state: 'APPROVED' });
      repo.markPendingsInvited.mockRejectedValue(new Error('db down'));

      const result = await uc.execute({ ...base, pending: PENDING });

      expect(notifications.sendEmail).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        pendingParticipant: { status: 'PENDING' },
        failedEffects: [],
        warning: INVITED_NOT_MARKED_WARNING,
      });
    });

    it('stays added as PENDING with a warning when the email fails', async () => {
      const { uc, repo, changeLog } = setup({
        state: 'APPROVED',
        emailFails: true,
      });

      const result = await uc.execute({ ...base, pending: PENDING });

      expect(result).toMatchObject({
        pendingParticipant: { status: 'PENDING' },
        failedEffects: ['NOTIFICATION'],
        warning: INVITATION_FAILED_WARNING,
      });
      expect(repo.markPendingsInvited).not.toHaveBeenCalled();
      expect(changeLog.create).toHaveBeenCalledTimes(1);
    });

    it('answers PARTICIPANT_HAS_ACTIVE_PROJECT (409) when the student is in another active project of the event, and changes nothing', async () => {
      const { uc, repo, changeLog, activeSubmissions } = setup({
        conflicts: [{ email: 'ana@uni.edu', projectId: 12 }],
      });

      const error = (await uc
        .execute({ ...base, pending: PENDING })
        .catch((e: unknown) => e)) as AdminParticipantsError;

      expect(activeSubmissions.execute).toHaveBeenCalledWith({
        eventId: 9,
        emails: ['ana@uni.edu'],
      });
      expect(error).toBeInstanceOf(AdminParticipantsError);
      expect(error.rejection).toMatchObject({
        code: 'PARTICIPANT_HAS_ACTIVE_PROJECT',
        email: 'ana@uni.edu',
        projectId: 12,
      });
      expect(repo.addPendingParticipant).not.toHaveBeenCalled();
      expect(changeLog.create).not.toHaveBeenCalled();
    });

    it('answers PARTICIPANT_HAS_ACTIVE_PROJECT when the email has an account enrolled in another project of the event', async () => {
      const { uc, changeLog } = setup({
        account: { id: 42, email: 'ana@uni.edu', firstName: 'Ana' },
        enrolledIn: [
          {
            id: 4,
            eventId: 9,
            courseId: 3,
            name: 'Robot',
            state: 'UNDER_REVIEW',
          },
          { id: 15, eventId: 9, courseId: 3, name: 'Dron', state: 'APPROVED' },
        ],
      });

      await expect(
        uc.execute({ ...base, pending: PENDING }),
      ).rejects.toMatchObject({
        rejection: { code: 'PARTICIPANT_HAS_ACTIVE_PROJECT', projectId: 15 },
      });
      expect(changeLog.create).not.toHaveBeenCalled();
    });

    it('answers PARTICIPANT_ALREADY_IN_PROJECT when the email is already pending in the project', async () => {
      const { uc, repo } = setup({
        pendings: [
          {
            pendingId: 3,
            projectId: 4,
            firstName: 'Ana',
            email: 'ana@uni.edu',
            studentCode: '1',
            semester: '6',
            career: 'x',
            status: 'PENDING',
          },
        ],
        conflicts: [{ email: 'ana@uni.edu', projectId: 4 }],
      });

      await expect(
        uc.execute({ ...base, pending: PENDING }),
      ).rejects.toMatchObject({
        rejection: { code: 'PARTICIPANT_ALREADY_IN_PROJECT' },
      });
      expect(repo.addPendingParticipant).not.toHaveBeenCalled();
    });

    it('answers PARTICIPANT_ALREADY_IN_PROJECT when an enrolled participant has the same student code, under another email', async () => {
      const { uc, repo, changeLog } = setup({
        participants: [{ userId: 42, projectId: 4, studentCode: '2021123456' }],
      });

      await expect(
        uc.execute({
          ...base,
          pending: {
            ...PENDING,
            email: 'ana.personal@gmail.com',
            studentCode: ' 2021123456 ',
          },
        }),
      ).rejects.toMatchObject({
        rejection: {
          code: 'PARTICIPANT_ALREADY_IN_PROJECT',
          email: 'ana.personal@gmail.com',
          message: expect.stringContaining('2021123456') as unknown,
        },
      });
      expect(repo.addPendingParticipant).not.toHaveBeenCalled();
      expect(changeLog.create).not.toHaveBeenCalled();
    });

    it('answers PARTICIPANT_ALREADY_IN_PROJECT when a pending participant who has not joined has the same student code', async () => {
      const { uc, repo } = setup({
        pendings: [
          {
            pendingId: 3,
            projectId: 4,
            firstName: 'Ana',
            email: 'ana@uni.edu',
            studentCode: '2021123456',
            semester: '6',
            career: 'x',
            status: 'INVITED',
          },
        ],
      });

      await expect(
        uc.execute({
          ...base,
          pending: { ...PENDING, email: 'ana.personal@gmail.com' },
        }),
      ).rejects.toMatchObject({
        rejection: { code: 'PARTICIPANT_ALREADY_IN_PROJECT' },
      });
      expect(repo.addPendingParticipant).not.toHaveBeenCalled();
    });

    it('answers 400 for an invalid email before calling other services', async () => {
      const { uc, activeSubmissions } = setup();

      await expect(
        uc.execute({ ...base, pending: { ...PENDING, email: 'ana' } }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(activeSubmissions.execute).not.toHaveBeenCalled();
    });
  });

  describe('enrolled participant', () => {
    const account = {
      id: 42,
      email: 'Ana@Uni.edu',
      firstName: 'Ana',
      lastName: 'Pérez',
    };

    it('adds the user with the student code and records it', async () => {
      const { uc, repo, changeLog, inTransaction } = setup({ account });

      const result = await uc.execute({
        ...base,
        userId: 42,
        studentCode: ' 2021 ',
      });

      expect(repo.addParticipant).toHaveBeenCalledWith({
        projectId: 4,
        userId: 42,
        studentCode: '2021',
      });
      expect(result.participant).toEqual({
        projectId: 4,
        userId: 42,
        studentCode: '2021',
      });
      expect(changeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PARTICIPANTS',
          before: { participant: null },
          after: {
            participant: {
              type: 'ENROLLED',
              userId: 42,
              studentCode: '2021',
              email: 'Ana@Uni.edu',
              firstName: 'Ana',
              lastName: 'Pérez',
            },
          },
        }),
      );
      expect(inTransaction).toEqual([
        'lock',
        'lockStudent',
        'check',
        'participant',
        'changeLog',
      ]);
      expect(repo.lockStudentInEvent).toHaveBeenCalledWith(9, 'ana@uni.edu');
    });

    it('also joins a pending row of this project with the same email saved under another student code', async () => {
      const { uc, repo } = setup({
        account,
        pendings: [
          {
            pendingId: 3,
            projectId: 4,
            firstName: 'Ana',
            email: ' ANA@uni.edu',
            studentCode: '1999',
            semester: '6',
            career: 'x',
            status: 'PENDING',
          },
          {
            pendingId: 5,
            projectId: 4,
            firstName: 'Luis',
            email: 'luis@uni.edu',
            studentCode: '2000',
            semester: '6',
            career: 'x',
            status: 'PENDING',
          },
        ],
        conflicts: [{ email: 'ana@uni.edu', projectId: 4 }],
      });

      await uc.execute({ ...base, userId: 42, studentCode: '2021' });

      expect(repo.markPendingJoined).toHaveBeenCalledWith(
        4,
        '2021',
        expect.any(Date),
      );
      expect(repo.markPendingJoined).toHaveBeenCalledWith(
        4,
        '1999',
        expect.any(Date),
      );
      expect(repo.markPendingJoined).not.toHaveBeenCalledWith(
        4,
        '2000',
        expect.any(Date),
      );
    });

    it('answers PARTICIPANT_HAS_ACTIVE_PROJECT when the user is enrolled in another active project of the event', async () => {
      const { uc, repo } = setup({
        account,
        enrolledIn: [
          {
            id: 15,
            eventId: 9,
            courseId: 3,
            name: 'Dron',
            state: 'REQUEST_CHANGES',
          },
        ],
      });

      await expect(
        uc.execute({ ...base, userId: 42, studentCode: '2021' }),
      ).rejects.toMatchObject({
        rejection: {
          code: 'PARTICIPANT_HAS_ACTIVE_PROJECT',
          projectId: 15,
          userId: 42,
        },
      });
      expect(repo.listProjectsByParticipant).toHaveBeenCalledWith(42, [
        'UNDER_REVIEW',
        'APPROVED',
        'REQUEST_CHANGES',
      ]);
      expect(repo.addParticipant).not.toHaveBeenCalled();
    });

    it('lets a pending student of this project be linked to their account', async () => {
      const { uc, repo } = setup({
        account,
        conflicts: [{ email: 'ana@uni.edu', projectId: 4 }],
      });

      await uc.execute({ ...base, userId: 42, studentCode: '2021' });

      expect(repo.addParticipant).toHaveBeenCalled();
      expect(repo.markPendingJoined).toHaveBeenCalledWith(
        4,
        '2021',
        expect.any(Date),
      );
    });

    it('answers PARTICIPANT_ALREADY_IN_PROJECT when the user is already enrolled', async () => {
      const { uc } = setup({
        account,
        participants: [{ userId: 42, projectId: 4, studentCode: '2021' }],
      });

      await expect(
        uc.execute({ ...base, userId: 42, studentCode: '2021' }),
      ).rejects.toMatchObject({
        rejection: { code: 'PARTICIPANT_ALREADY_IN_PROJECT', userId: 42 },
      });
    });

    it('answers 404 for an unknown user and 400 without student code', async () => {
      await expect(
        setup().uc.execute({ ...base, userId: 42, studentCode: '2021' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        setup({ account }).uc.execute({ ...base, userId: 42 }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it('answers 400 when the request is both or neither kind of participant', async () => {
    const { uc } = setup();
    await expect(uc.execute({ ...base })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      uc.execute({ ...base, userId: 42, studentCode: '1', pending: PENDING }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('answers 404 when the project does not exist', async () => {
    const { uc, repo } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(
      uc.execute({ ...base, pending: PENDING }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
