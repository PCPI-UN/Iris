import { ExecuteProjectImportUC } from '../execute-project-import.uc';
import {
  PreviewProjectImportUC,
  ProjectImportRowInput,
} from '../preview-project-import.uc';
import {
  AdminCreateProjectInput,
  AdminCreateProjectUC,
} from '../admin-create-project.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { EventServicePort } from '../../ports/event-service.port';
import { AuthServicePort } from '../../ports/auth-service.port';
import { CreateProjectUC } from '../create-project.uc';
import { CheckActiveSubmissionByEmailsUC } from '../check-active-submission-by-emails.uc';
import { PreconditionError } from '../../../domain/errors';
import { ParticipantInOtherProjectError } from '../../../domain/admin-project-creation';
import { ProjectWithJurorIds } from '../../../domain/entities/project.entity';

const EVENT_ID = 10;
const SISTEMAS = { id: 3, name: 'Ingeniería de Sistemas', active: true };
const ANA = { id: 11, firstName: 'Ana', email: 'ana@uni.edu' };

const student = (email: string, code: string) => ({
  firstName: 'Nombre',
  lastName: 'Apellido',
  email,
  studentCode: code,
  semester: '6',
  career: 'Ingeniería de Sistemas',
});

const row = (
  rowNumber: number,
  change: Partial<ProjectImportRowInput> = {},
): ProjectImportRowInput => ({
  rowNumber,
  categoryName: SISTEMAS.name,
  nrc: '1001',
  name: `Proyecto ${rowNumber}`,
  participants: [student(`e${rowNumber}@uni.edu`, `c${rowNumber}`)],
  tutorEmails: [],
  ...change,
});

describe('ExecuteProjectImportUC', () => {
  let projects: ProjectWithJurorIds[];
  let pendingConflicts: { email: string; projectId: number }[];
  let adminCreate: { execute: jest.Mock };
  let uc: ExecuteProjectImportUC;
  let nextId: number;

  beforeEach(() => {
    projects = [];
    pendingConflicts = [];
    nextId = 100;
    const repo = {
      listWithJurorsByEvent: jest.fn(() => Promise.resolve(projects)),
      listProjectsByParticipant: jest.fn(() => Promise.resolve([])),
    };
    const events = {
      getEventById: jest.fn(() =>
        Promise.resolve({
          id: EVENT_ID,
          name: 'Feria',
          active: true,
          requiresCourse: true,
          termId: 7,
        }),
      ),
      listCategoriesByEvent: jest.fn(() => Promise.resolve([SISTEMAS])),
    };
    const auth = {
      findUserByEmail: jest.fn((email: string) =>
        Promise.resolve(email === ANA.email ? ANA : null),
      ),
      findUsersByRoles: jest.fn(() => Promise.resolve([])),
    };
    const preview = new PreviewProjectImportUC(
      repo as unknown as ProjectRepository,
      events as unknown as EventServicePort,
      auth as unknown as AuthServicePort,
      {
        resolveAcademicCourse: jest.fn(() => Promise.resolve(50)),
      } as unknown as CreateProjectUC,
      {
        execute: jest.fn(() =>
          Promise.resolve({ conflicts: pendingConflicts }),
        ),
      } as unknown as CheckActiveSubmissionByEmailsUC,
    );
    // Creates the project as AdminCreateProjectUC would: students with an account join, the
    // others are invited (APPROVED) or stay pending (UNDER_REVIEW)
    adminCreate = {
      execute: jest.fn((input: AdminCreateProjectInput) => {
        const project = {
          id: nextId++,
          eventId: input.eventId,
          courseId: input.courseId,
          name: input.name,
          state: input.state ?? 'APPROVED',
        };
        projects.push({ ...project, jurorUserIds: [] });
        const participants = input.participants.map((p) => ({
          email: p.email.trim().toLowerCase(),
          status:
            p.email === ANA.email
              ? 'JOINED'
              : project.state === 'APPROVED'
                ? 'INVITED'
                : 'PENDING',
        }));
        for (const p of participants) {
          pendingConflicts.push({ email: p.email, projectId: project.id });
        }
        return Promise.resolve({
          project,
          participants,
          failedEffects: [],
          warning: null,
        });
      }),
    };
    uc = new ExecuteProjectImportUC(
      preview,
      adminCreate as unknown as AdminCreateProjectUC,
    );
  });

  const execute = (rows: ProjectImportRowInput[]) =>
    uc.execute({
      eventId: EVENT_ID,
      rows,
      actingUserId: 5,
      fileName: 'feria.xlsx',
    });

  it('creates each CREATE row in order with a bulk origin and its row number', async () => {
    const res = await execute([
      row(2, {
        participants: [
          { ...student('ana@uni.edu', '1'), slot: 1 },
          { ...student('luis@uni.edu', '2'), slot: 2 },
        ],
        description: '  ',
        projectCode: ' 07 ',
      }),
      row(3, { state: 'UNDER_REVIEW' }),
    ]);

    expect(adminCreate.execute).toHaveBeenCalledTimes(2);
    expect(adminCreate.execute).toHaveBeenNthCalledWith(1, {
      eventId: EVENT_ID,
      courseId: SISTEMAS.id,
      name: 'Proyecto 2',
      description: undefined,
      projectCode: '07',
      nrc: '1001',
      state: 'APPROVED',
      participants: [student('ana@uni.edu', '1'), student('luis@uni.edu', '2')],
      tutorUserIds: [],
      pendingTutors: [],
      actingUserId: 5,
      origin: { kind: 'ADMIN_BULK', fileName: 'feria.xlsx', rowNumber: 2 },
    });
    expect(adminCreate.execute).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        state: 'UNDER_REVIEW',
        origin: { kind: 'ADMIN_BULK', fileName: 'feria.xlsx', rowNumber: 3 },
      }),
    );
    expect(res.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        outcome: 'CREATED',
        projectId: 100,
        participants: [
          { email: 'ana@uni.edu', status: 'HAS_ACCOUNT' },
          { email: 'luis@uni.edu', status: 'NO_ACCOUNT' },
        ],
        failedEffects: [],
        message: 'Creado con 2 integrantes (1 sin cuenta).',
      }),
      expect.objectContaining({
        rowNumber: 3,
        outcome: 'CREATED',
        projectId: 101,
      }),
    ]);
    // Only the pending student of the APPROVED project got the approval email
    expect(res.totals).toEqual({
      rows: 2,
      created: 2,
      skipped: 0,
      errors: 0,
      emailsSent: 1,
      failedEffects: 0,
    });
  });

  it('reports a row that fails at creation as ERROR and creates the others', async () => {
    adminCreate.execute
      .mockImplementationOnce(adminCreate.execute.getMockImplementation()!)
      .mockRejectedValueOnce(new ParticipantInOtherProjectError(['e3@uni.edu']))
      .mockRejectedValueOnce(new Error('connection reset'));

    const res = await execute([row(2), row(3), row(4), row(5)]);

    expect(res.rows.map((r) => [r.rowNumber, r.outcome])).toEqual([
      [2, 'CREATED'],
      [3, 'ERROR'],
      [4, 'ERROR'],
      [5, 'CREATED'],
    ]);
    expect(res.rows[1].message).toBe(
      'No se creó: Estos integrantes ya están en otro proyecto del evento: e3@uni.edu',
    );
    expect(res.rows[2].message).toBe(
      'No se creó: falló inesperadamente; vuelva a intentarlo.',
    );
    expect(res.totals).toMatchObject({ created: 2, errors: 2, emailsSent: 2 });
  });

  it('counts the rows with failed effects and keeps the warning in the message', async () => {
    adminCreate.execute.mockResolvedValueOnce({
      project: {
        id: 100,
        eventId: EVENT_ID,
        courseId: 3,
        name: 'Proyecto 2',
        state: 'APPROVED',
      },
      participants: [{ email: 'e2@uni.edu', status: 'PENDING' }],
      failedEffects: ['NOTIFICATION'],
      warning: 'El proyecto se creó, pero …',
    });

    const res = await execute([row(2)]);

    expect(res.rows[0]).toMatchObject({
      outcome: 'CREATED',
      failedEffects: ['NOTIFICATION'],
      message:
        'Creado con 1 integrante (1 sin cuenta). El proyecto se creó, pero …',
    });
    expect(res.totals).toMatchObject({ emailsSent: 0, failedEffects: 1 });
  });

  it('keeps the SKIP rows as they are and creates the rest', async () => {
    projects = [
      {
        id: 40,
        eventId: EVENT_ID,
        courseId: 3,
        name: 'Robot',
        state: 'APPROVED',
        jurorUserIds: [],
      },
    ];

    const res = await execute([row(2, { name: 'Robot' }), row(3)]);

    expect(res.rows.map((r) => [r.outcome, r.projectId])).toEqual([
      ['SKIP', 40],
      ['CREATED', 100],
    ]);
    expect(adminCreate.execute).toHaveBeenCalledTimes(1);
    expect(res.totals).toMatchObject({ created: 1, skipped: 1 });
  });

  it('creates nothing the second time: every row is SKIP and the import is refused', async () => {
    const rows = [row(2), row(3)];
    await execute(rows);
    adminCreate.execute.mockClear();

    const preview = await (
      uc as unknown as { preview: PreviewProjectImportUC }
    ).preview.execute({ eventId: EVENT_ID, rows });
    expect(preview.rows.map((r) => [r.outcome, r.projectId])).toEqual([
      ['SKIP', 100],
      ['SKIP', 101],
    ]);

    await expect(execute(rows)).rejects.toThrow(
      new PreconditionError(
        'No se puede ejecutar la importación. No hay proyectos por crear: todos ya existen en el evento.',
      ),
    );
    expect(adminCreate.execute).not.toHaveBeenCalled();
  });

  it('refuses a file with errors and creates nothing', async () => {
    await expect(
      execute([row(2), row(3, { categoryName: 'Medicina' })]),
    ).rejects.toThrow(
      'No se puede ejecutar la importación. Hay 1 proyecto con error; corríjalo y vuelva a cargar el archivo.',
    );
    expect(adminCreate.execute).not.toHaveBeenCalled();
  });
});
