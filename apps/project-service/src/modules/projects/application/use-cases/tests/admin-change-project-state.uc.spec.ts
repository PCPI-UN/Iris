import { EmailTemplate } from '@app/common/generated/notification';
import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { AdminChangeProjectStateUC } from '../admin-change-project-state.uc';
import { ProjectApprovalEffects } from '../../services/project-approval-effects.service';
import { SetProjectTutorsUC } from '../set-project-tutors.uc';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../domain/errors';
import {
  ProjectStateChangeBlockedError,
  STATE_CHANGED_MEANWHILE,
} from '../../../domain/admin-state-change';
import { ProjectState } from '../../../domain/entities/project.entity';

describe('AdminChangeProjectStateUC', () => {
  const PENDINGS = [
    { email: 'a@uni.edu', firstName: 'Ana', lastName: 'Ruiz' },
    { email: 'b@uni.edu', firstName: null, lastName: null },
  ];

  const setup = (
    options: {
      state?: ProjectState;
      evaluationCount?: number;
      resultsPublished?: boolean;
      eventType?: unknown;
    } = {},
  ) => {
    const project = {
      id: 4,
      eventId: 9,
      name: 'Robot',
      state: options.state ?? 'APPROVED',
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
      changeStateIfCurrent: jest.fn(
        (id: number, _from: ProjectState, state: ProjectState) => {
          if (open) inTransaction.push('state');
          return Promise.resolve<object | null>({ ...project, id, state });
        },
      ),
      listPendingParticipants: jest.fn().mockResolvedValue(PENDINGS),
    };
    const changeLog = {
      create: jest.fn((entry: object) => {
        if (open) inTransaction.push('changeLog');
        return Promise.resolve({ id: 1, createdAt: new Date(), ...entry });
      }),
    };
    const events = {
      getEventById: jest.fn().mockResolvedValue({
        id: 9,
        eventType: options.eventType ?? 1,
        resultsPublished: options.resultsPublished ?? false,
      }),
    };
    const evaluations = {
      countEvaluationsByProject: jest
        .fn()
        .mockResolvedValue(options.evaluationCount ?? 0),
    };
    const notifications = {
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
    };
    const tutors = { activate: jest.fn().mockResolvedValue(undefined) };
    const effects = new ProjectApprovalEffects(
      repo as any,
      notifications,
      tutors as unknown as SetProjectTutorsUC,
    );
    const uc = new AdminChangeProjectStateUC(
      repo as any,
      events as any,
      evaluations,
      effects,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    return {
      uc,
      repo,
      changeLog,
      uow,
      inTransaction,
      events,
      evaluations,
      notifications,
      tutors,
    };
  };

  const base = { projectId: 4, actingUserId: 1, reason: 'Aprobado por error' };

  beforeEach(() =>
    jest.spyOn(console, 'error').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  it('moves an APPROVED project without evaluations to UNDER_REVIEW and records the change', async () => {
    const { uc, repo, changeLog, inTransaction, notifications, tutors } =
      setup();

    const result = await uc.execute({ ...base, state: 'UNDER_REVIEW' });

    expect(result.project.state).toBe('UNDER_REVIEW');
    // Only if the state is still the one read; the reason is cleared outside REJECTED/REQUEST_CHANGES
    expect(repo.changeStateIfCurrent).toHaveBeenCalledWith(
      4,
      'APPROVED',
      'UNDER_REVIEW',
      null,
    );
    expect(changeLog.create).toHaveBeenCalledWith({
      projectId: 4,
      actorUserId: 1,
      action: 'STATE',
      before: { state: 'APPROVED' },
      after: { state: 'UNDER_REVIEW' },
      reason: 'Aprobado por error',
    });
    // Both writes in the same transaction
    expect(inTransaction).toEqual(['state', 'changeLog']);
    expect(tutors.activate).not.toHaveBeenCalled();
    expect(notifications.sendEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({ failedEffects: [], warning: null });
  });

  it.each([undefined, '', '   '])(
    'answers 400 in Spanish without a reason (%p) and records nothing',
    async (reason) => {
      const { uc, repo } = setup();

      await expect(
        uc.execute({ ...base, state: 'UNDER_REVIEW', reason }),
      ).rejects.toThrow(
        new ValidationError('El motivo del cambio de estado es obligatorio'),
      );
      expect(repo.changeStateIfCurrent).not.toHaveBeenCalled();
    },
  );

  it('answers 400 when the project is already in that state', async () => {
    const { uc, repo } = setup({ state: 'REJECTED' });

    await expect(uc.execute({ ...base, state: 'REJECTED' })).rejects.toThrow(
      ValidationError,
    );
    expect(repo.changeStateIfCurrent).not.toHaveBeenCalled();
  });

  it('answers 400 for an unknown state', async () => {
    const { uc } = setup();

    await expect(uc.execute({ ...base, state: undefined })).rejects.toThrow(
      ValidationError,
    );
  });

  it('answers 404 when the project does not exist', async () => {
    const { uc, repo } = setup();
    repo.findById.mockResolvedValue(null);

    await expect(uc.execute({ ...base, state: 'APPROVED' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('blocks a project with evaluations without force, saying why and warning about leaving APPROVED', async () => {
    const { uc, repo, notifications } = setup({ evaluationCount: 2 });

    const error = await uc
      .execute({ ...base, state: 'REJECTED', notify: true })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProjectStateChangeBlockedError);
    const { block } = error as ProjectStateChangeBlockedError;
    expect(block).toMatchObject({
      hasEvaluations: true,
      evaluationCount: 2,
      resultsPublished: false,
      leavesApproved: true,
    });
    expect(block.message).toContain('2 evaluaciones de jurados');
    expect(block.message).toContain('sale del ranking');
    expect(block.message).toContain('importación de jurados');
    expect(repo.changeStateIfCurrent).not.toHaveBeenCalled();
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('applies the change to a project with evaluations when force is true', async () => {
    const { uc, repo, evaluations } = setup({ evaluationCount: 1 });

    const result = await uc.execute({
      ...base,
      state: 'UNDER_REVIEW',
      force: true,
    });

    expect(result.project.state).toBe('UNDER_REVIEW');
    expect(repo.changeStateIfCurrent).toHaveBeenCalledTimes(1);
    expect(evaluations.countEvaluationsByProject).not.toHaveBeenCalled();
  });

  it('blocks a project of an event with published results without force', async () => {
    const { uc, repo } = setup({ state: 'REJECTED', resultsPublished: true });

    const error = await uc
      .execute({ ...base, state: 'APPROVED' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProjectStateChangeBlockedError);
    const { block } = error as ProjectStateChangeBlockedError;
    expect(block).toMatchObject({
      hasEvaluations: false,
      resultsPublished: true,
      leavesApproved: false,
    });
    expect(block.message).toContain('el evento ya publicó sus resultados');
    expect(block.message).not.toContain('sale del ranking');
    expect(repo.changeStateIfCurrent).not.toHaveBeenCalled();
  });

  it('REJECTED to APPROVED activates the tutors as the normal approval, without emails when notify is false', async () => {
    const { uc, tutors, notifications } = setup({ state: 'REJECTED' });

    await uc.execute({ ...base, state: 'APPROVED', notify: false });

    expect(tutors.activate).toHaveBeenCalledWith(4, 'Exposition');
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('REJECTED to APPROVED with notify emails each pending participant with the approval template', async () => {
    const { uc, tutors, notifications } = setup({
      state: 'REJECTED',
      eventType: 2,
    });

    await uc.execute({ ...base, state: 'APPROVED', notify: true });

    expect(tutors.activate).toHaveBeenCalledWith(4, 'Competition');
    expect(notifications.sendEmail).toHaveBeenCalledTimes(2);
    expect(notifications.sendEmail).toHaveBeenNthCalledWith(1, {
      to: 'a@uni.edu',
      template: EmailTemplate.PARTICIPANTS_APPROVED,
      params: { firstName: 'Ana', lastName: 'Ruiz', projectName: 'Robot' },
    });
    expect(notifications.sendEmail).toHaveBeenNthCalledWith(2, {
      to: 'b@uni.edu',
      template: EmailTemplate.PARTICIPANTS_APPROVED,
      params: { firstName: 'Estudiante', lastName: '', projectName: 'Robot' },
    });
  });

  it.each([
    ['REJECTED', 1, EmailTemplate.PROJECT_REJECTED],
    ['REJECTED', 'COMPETENCIA', EmailTemplate.PARTICIPANTS_REJECTED],
    ['REQUEST_CHANGES', 1, EmailTemplate.REQUEST_CHANGES],
  ] as const)(
    'with notify, %s (event type %p) sends its template with the reason and stores the reason',
    async (state, eventType, template) => {
      const { uc, repo, changeLog, notifications } = setup({
        state: 'UNDER_REVIEW',
        eventType,
      });

      await uc.execute({ ...base, state, reason: '  Plagio  ', notify: true });

      expect(repo.changeStateIfCurrent).toHaveBeenCalledWith(
        4,
        'UNDER_REVIEW',
        state,
        'Plagio',
      );
      expect(changeLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Plagio' }),
      );
      expect(notifications.sendEmail).toHaveBeenCalledWith({
        to: 'a@uni.edu',
        template,
        params: {
          firstName: 'Ana',
          lastName: 'Ruiz',
          projectName: 'Robot',
          reason: 'Plagio',
        },
      });
    },
  );

  it('sends no email when moving to UNDER_REVIEW even with notify', async () => {
    const { uc, notifications } = setup({ state: 'REJECTED' });

    await uc.execute({ ...base, state: 'UNDER_REVIEW', notify: true });

    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('sends no email without notify', async () => {
    const { uc, notifications } = setup({ state: 'UNDER_REVIEW' });

    await uc.execute({ ...base, state: 'REJECTED' });

    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('sends no email and activates nothing when the change log insert fails', async () => {
    const { uc, changeLog, notifications, tutors } = setup({
      state: 'REJECTED',
    });
    changeLog.create.mockRejectedValue(new Error('insert failed'));

    await expect(
      uc.execute({ ...base, state: 'APPROVED', notify: true }),
    ).rejects.toThrow('insert failed');
    expect(tutors.activate).not.toHaveBeenCalled();
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('clears the old reason when a rejected project is corrected to APPROVED', async () => {
    const { uc, repo, changeLog } = setup({ state: 'REJECTED' });

    await uc.execute({ ...base, state: 'APPROVED' });

    expect(repo.changeStateIfCurrent).toHaveBeenCalledWith(
      4,
      'REJECTED',
      'APPROVED',
      null,
    );
    // The reason of the correction stays in the change log
    expect(changeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Aprobado por error' }),
    );
  });

  it('answers 409 and records nothing when another change saved a different state first', async () => {
    const { uc, repo, changeLog, notifications, tutors } = setup({
      state: 'REJECTED',
    });
    repo.changeStateIfCurrent.mockResolvedValue(null);

    await expect(
      uc.execute({ ...base, state: 'APPROVED', notify: true }),
    ).rejects.toThrow(new ConflictError(STATE_CHANGED_MEANWHILE));
    expect(changeLog.create).not.toHaveBeenCalled();
    expect(tutors.activate).not.toHaveBeenCalled();
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('answers with the saved project and TUTOR_ACTIVATION when the tutor activation fails, and still sends the emails', async () => {
    const { uc, tutors, notifications } = setup({ state: 'REJECTED' });
    tutors.activate.mockRejectedValue(new Error('auth-service unavailable'));

    const result = await uc.execute({
      ...base,
      state: 'APPROVED',
      notify: true,
    });

    expect(result.project.state).toBe('APPROVED');
    expect(result.failedEffects).toEqual(['TUTOR_ACTIVATION']);
    expect(result.warning).toContain('El estado se cambió');
    expect(result.warning).toContain('tutores');
    expect(notifications.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('reports NOTIFICATION when an email fails or the participants cannot be read', async () => {
    const first = setup({ state: 'UNDER_REVIEW' });
    first.notifications.sendEmail.mockRejectedValueOnce(new Error('smtp'));

    const partial = await first.uc.execute({
      ...base,
      state: 'REJECTED',
      notify: true,
    });

    expect(partial.failedEffects).toEqual(['NOTIFICATION']);
    expect(first.notifications.sendEmail).toHaveBeenCalledTimes(2);

    const second = setup({ state: 'UNDER_REVIEW' });
    second.repo.listPendingParticipants.mockRejectedValue(new Error('db'));

    const none = await second.uc.execute({
      ...base,
      state: 'REJECTED',
      notify: true,
    });

    expect(none.project.state).toBe('REJECTED');
    expect(none.failedEffects).toEqual(['NOTIFICATION']);
    expect(none.warning).toContain('correos');
  });
});
