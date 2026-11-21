import { UnitOfWork } from '@app/common/ports/unit-of-work.port';
import { AdminUpdateProjectUC } from '../admin-update-project.uc';
import { UpdateProjectUC } from '../update-project.uc';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import {
  AdminProjectEditConflictError,
  ProjectNameTakenError,
} from '../../../domain/admin-project-edit';
import { Project } from '../../../domain/entities/project.entity';

describe('AdminUpdateProjectUC', () => {
  const PROJECT: Project = {
    id: 4,
    eventId: 9,
    courseId: 3,
    name: 'Robot',
    description: 'Clasifica residuos',
    projectCode: 'ING-1',
    eventNumber: '7',
    state: 'APPROVED',
  };

  const setup = (
    options: {
      evaluationCount?: number;
      sameName?: Project | null;
      categories?: { id: number; name: string; active: boolean }[];
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
    const repo = {
      findById: jest.fn().mockResolvedValue({ ...PROJECT }),
      findByEventAndName: jest.fn().mockResolvedValue(options.sameName ?? null),
      updateProject: jest.fn((input: Partial<Project> & { id: number }) => {
        if (open) inTransaction.push('project');
        const values = Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        );
        return Promise.resolve({ ...PROJECT, ...values });
      }),
    };
    const changeLog = {
      create: jest.fn((entry: object) => {
        if (open) inTransaction.push('changeLog');
        return Promise.resolve({ id: 1, createdAt: new Date(), ...entry });
      }),
      listByProject: jest.fn(),
    };
    const events = {
      listCategoriesByEvent: jest.fn().mockResolvedValue(
        options.categories ?? [
          { id: 3, name: 'Ingeniería', active: true },
          { id: 5, name: 'Ciencias', active: true },
          { id: 6, name: 'Artes', active: false },
        ],
      ),
    };
    const evaluations = {
      countEvaluationsByProject: jest
        .fn()
        .mockResolvedValue(options.evaluationCount ?? 0),
    };
    const uc = new AdminUpdateProjectUC(
      repo as any,
      new UpdateProjectUC(repo as any),
      events as any,
      evaluations,
      changeLog as any,
      uow as unknown as UnitOfWork,
    );
    return { uc, repo, changeLog, uow, events, evaluations, inTransaction };
  };

  const base = { projectId: 4, actingUserId: 1 };

  it('changes the name, description, code and number in the event and returns the new values', async () => {
    const { uc, repo, changeLog, inTransaction } = setup();

    const result = await uc.execute({
      ...base,
      name: '  Robot clasificador ',
      description: 'Usa visión por computador',
      projectCode: 'ING-42',
      eventNumber: '17',
      reason: 'Corrección pedida por el profesor',
    });

    expect(result).toMatchObject({
      name: 'Robot clasificador',
      description: 'Usa visión por computador',
      projectCode: 'ING-42',
      eventNumber: '17',
      courseId: 3,
    });
    expect(repo.updateProject).toHaveBeenCalledWith({
      id: 4,
      name: 'Robot clasificador',
      description: 'Usa visión por computador',
      projectCode: 'ING-42',
      eventNumber: '17',
      courseId: undefined,
    });
    expect(changeLog.create).toHaveBeenCalledTimes(1);
    expect(changeLog.create).toHaveBeenCalledWith({
      projectId: 4,
      actorUserId: 1,
      action: 'INFO',
      before: {
        name: 'Robot',
        description: 'Clasifica residuos',
        projectCode: 'ING-1',
        eventNumber: '7',
      },
      after: {
        name: 'Robot clasificador',
        description: 'Usa visión por computador',
        projectCode: 'ING-42',
        eventNumber: '17',
      },
      reason: 'Corrección pedida por el profesor',
    });
    // The edit and its entry are saved together
    expect(inTransaction).toEqual(['project', 'changeLog']);
  });

  it('records and writes only the fields that changed', async () => {
    const { uc, repo, changeLog } = setup();

    await uc.execute({
      ...base,
      name: 'Robot',
      description: 'Clasifica residuos',
      eventNumber: '8',
    });

    expect(repo.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, eventNumber: '8', name: undefined }),
    );
    expect(changeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INFO',
        before: { eventNumber: '7' },
        after: { eventNumber: '8' },
        reason: null,
      }),
    );
  });

  it('clears description, code and number with an empty text and records null', async () => {
    const { uc, repo, changeLog } = setup();

    await uc.execute({
      ...base,
      description: '',
      projectCode: '  ',
      eventNumber: null,
    });

    expect(repo.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        description: null,
        projectCode: null,
        eventNumber: null,
      }),
    );
    expect(changeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        after: { description: null, projectCode: null, eventNumber: null },
      }),
    );
  });

  it('writes nothing and records no entry when no value differs', async () => {
    const { uc, repo, changeLog, uow } = setup();

    const result = await uc.execute({
      ...base,
      name: 'Robot',
      courseId: 3,
      reason: 'Sin cambios',
    });

    expect(result).toMatchObject({ id: 4, name: 'Robot' });
    expect(uow.run).not.toHaveBeenCalled();
    expect(repo.updateProject).not.toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('answers 409 PROJECT_NAME_TAKEN in Spanish when another project of the event has the name', async () => {
    const { uc, repo, changeLog } = setup({
      sameName: { ...PROJECT, id: 11, name: 'Dron' },
    });

    const error = await uc
      .execute({ ...base, name: 'Dron' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProjectNameTakenError);
    expect((error as ProjectNameTakenError).conflict).toEqual({
      code: 'PROJECT_NAME_TAKEN',
      name: 'Dron',
      message:
        'Ya existe otro proyecto con el nombre "Dron" en este evento. Usa un nombre distinto.',
    });
    expect(repo.findByEventAndName).toHaveBeenCalledWith(9, 'Dron');
    expect(repo.updateProject).not.toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('does not look up the name when it does not change', async () => {
    const { uc, repo } = setup();

    await uc.execute({ ...base, name: 'Robot', eventNumber: '9' });

    expect(repo.findByEventAndName).not.toHaveBeenCalled();
  });

  it('answers 400 for a category of another event and records nothing', async () => {
    const { uc, repo, changeLog, events } = setup();

    await expect(uc.execute({ ...base, courseId: 99 })).rejects.toThrow(
      new ValidationError('La categoría no pertenece al evento del proyecto'),
    );
    expect(events.listCategoriesByEvent).toHaveBeenCalledWith(9);
    expect(repo.updateProject).not.toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('answers 400 for an inactive category of the event', async () => {
    const { uc } = setup();

    await expect(uc.execute({ ...base, courseId: 6 })).rejects.toThrow(
      ValidationError,
    );
  });

  it('changes the category of a project without evaluations and records CATEGORY', async () => {
    const { uc, repo, changeLog } = setup();

    const result = await uc.execute({
      ...base,
      courseId: 5,
      reason: 'Categoría equivocada',
    });

    expect(result.courseId).toBe(5);
    expect(repo.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, courseId: 5 }),
    );
    expect(changeLog.create).toHaveBeenCalledTimes(1);
    expect(changeLog.create).toHaveBeenCalledWith({
      projectId: 4,
      actorUserId: 1,
      action: 'CATEGORY',
      before: { courseId: 3 },
      after: { courseId: 5 },
      reason: 'Categoría equivocada',
    });
  });

  it('answers 409 PROJECT_CATEGORY_CHANGE_BLOCKED for a project with evaluations, without writing', async () => {
    const { uc, repo, changeLog } = setup({ evaluationCount: 2 });

    const error = await uc
      .execute({ ...base, courseId: 5, name: 'Robot 2' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdminProjectEditConflictError);
    expect((error as AdminProjectEditConflictError).conflict).toMatchObject({
      code: 'PROJECT_CATEGORY_CHANGE_BLOCKED',
      evaluationCount: 2,
      message: expect.stringContaining('2 evaluaciones de jurados') as unknown,
    });
    expect(repo.updateProject).not.toHaveBeenCalled();
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('changes the category of a project with evaluations with force', async () => {
    const { uc, evaluations, changeLog } = setup({ evaluationCount: 2 });

    const result = await uc.execute({ ...base, courseId: 5, force: true });

    expect(result.courseId).toBe(5);
    expect(evaluations.countEvaluationsByProject).not.toHaveBeenCalled();
    expect(changeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CATEGORY' }),
    );
  });

  it('does not count evaluations when only the basic data changes', async () => {
    const { uc, evaluations } = setup({ evaluationCount: 2 });

    await uc.execute({ ...base, eventNumber: '9' });

    expect(evaluations.countEvaluationsByProject).not.toHaveBeenCalled();
  });

  it('records INFO and CATEGORY entries, with the same reason, when both change', async () => {
    const { uc, changeLog, inTransaction } = setup();

    await uc.execute({ ...base, name: 'Dron', courseId: 5, reason: 'Ajuste' });

    expect(changeLog.create.mock.calls.map(([e]) => e)).toEqual([
      expect.objectContaining({
        action: 'INFO',
        before: { name: 'Robot' },
        after: { name: 'Dron' },
        reason: 'Ajuste',
      }),
      expect.objectContaining({
        action: 'CATEGORY',
        before: { courseId: 3 },
        after: { courseId: 5 },
        reason: 'Ajuste',
      }),
    ]);
    expect(inTransaction).toEqual(['project', 'changeLog', 'changeLog']);
  });

  it('never changes the state, even if the input carries one', async () => {
    const { uc, repo } = setup();

    await uc.execute({
      ...base,
      name: 'Dron',
      ...({ state: 'REJECTED' } as object),
    });

    expect(repo.updateProject.mock.calls[0][0]).not.toHaveProperty('state');
  });

  it('leaves no entry when the save fails because the name was taken meanwhile', async () => {
    const { uc, repo, changeLog } = setup();
    repo.updateProject.mockRejectedValueOnce(new ProjectNameTakenError('Dron'));

    await expect(uc.execute({ ...base, name: 'Dron' })).rejects.toBeInstanceOf(
      ProjectNameTakenError,
    );
    expect(changeLog.create).not.toHaveBeenCalled();
  });

  it('answers 400 for a blank name or a request without editable fields', async () => {
    const { uc } = setup();

    await expect(uc.execute({ ...base, name: '  ' })).rejects.toThrow(
      new ValidationError('El nombre del proyecto no puede estar vacío'),
    );
    await expect(uc.execute({ ...base, reason: 'x' })).rejects.toThrow(
      new ValidationError(
        'Indica al menos un dato del proyecto para modificar',
      ),
    );
  });

  it('answers 404 when the project does not exist', async () => {
    const { uc, repo } = setup();
    repo.findById.mockResolvedValueOnce(null);

    await expect(uc.execute({ ...base, name: 'Dron' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
