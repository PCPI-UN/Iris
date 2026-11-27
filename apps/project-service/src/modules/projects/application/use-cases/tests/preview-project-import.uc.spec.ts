import { status } from '@grpc/grpc-js';
import {
  MAX_PROJECT_IMPORT_ROWS,
  PreviewProjectImportUC,
  ProjectImportRowInput,
} from '../preview-project-import.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { EventServicePort } from '../../ports/event-service.port';
import { AuthServicePort, AuthUser } from '../../ports/auth-service.port';
import { CreateProjectUC } from '../create-project.uc';
import { CheckActiveSubmissionByEmailsUC } from '../check-active-submission-by-emails.uc';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import {
  Project,
  ProjectWithJurorIds,
} from '../../../domain/entities/project.entity';

const EVENT_ID = 10;
const SISTEMAS = { id: 3, name: 'Ingeniería de Sistemas', active: true };
const CIVIL = { id: 4, name: 'Ingeniería Civil', active: true };
const OLD = { id: 5, name: 'Categoría retirada', active: false };

const user = (id: number, email: string): AuthUser => ({
  id,
  firstName: email.split('@')[0],
  email,
  status: 'CONFIRMED',
});
const ANA = user(11, 'ana@uni.edu');
const PROFE = user(20, 'profe@uni.edu');
const NOT_TUTOR = user(21, 'otro@uni.edu');
const ACCOUNTS = [ANA, PROFE, NOT_TUTOR];

const existing = (
  id: number,
  name: string,
  courseId: number,
): ProjectWithJurorIds => ({
  id,
  eventId: EVENT_ID,
  courseId,
  name,
  state: 'APPROVED',
  jurorUserIds: [],
});

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

describe('PreviewProjectImportUC', () => {
  let event: Record<string, unknown>;
  let projects: ProjectWithJurorIds[];
  let pendingConflicts: { email: string; projectId: number }[];
  let enrolledIn: Record<number, Project[]>;
  let repo: {
    listWithJurorsByEvent: jest.Mock;
    listProjectsByParticipant: jest.Mock;
  };
  let events: { getEventById: jest.Mock; listCategoriesByEvent: jest.Mock };
  let auth: { findUserByEmail: jest.Mock; findUsersByRoles: jest.Mock };
  let createProject: { resolveAcademicCourse: jest.Mock };
  let activeSubmissions: { execute: jest.Mock };
  let uc: PreviewProjectImportUC;

  beforeEach(() => {
    event = {
      id: EVENT_ID,
      name: 'Feria',
      active: true,
      resultsPublished: false,
      requiresCourse: true,
      termId: 7,
    };
    projects = [];
    pendingConflicts = [];
    enrolledIn = {};
    repo = {
      listWithJurorsByEvent: jest.fn(() => Promise.resolve(projects)),
      listProjectsByParticipant: jest.fn((userId: number) =>
        Promise.resolve(enrolledIn[userId] ?? []),
      ),
    };
    events = {
      getEventById: jest.fn(() => Promise.resolve(event)),
      listCategoriesByEvent: jest.fn(() =>
        Promise.resolve([SISTEMAS, CIVIL, OLD]),
      ),
    };
    auth = {
      findUserByEmail: jest.fn((email: string) =>
        Promise.resolve(ACCOUNTS.find((u) => u.email === email) ?? null),
      ),
      findUsersByRoles: jest.fn(({ userIds }: { userIds: number[] }) =>
        Promise.resolve(
          userIds.filter((id) => id === PROFE.id).map((id) => ({ id })),
        ),
      ),
    };
    createProject = {
      resolveAcademicCourse: jest.fn((_termId: number, nrc: string) =>
        nrc === '9999'
          ? Promise.reject(
              new ValidationError(
                `El NRC ${nrc} no existe en el periodo del evento`,
              ),
            )
          : Promise.resolve(50),
      ),
    };
    activeSubmissions = {
      execute: jest.fn(() => Promise.resolve({ conflicts: pendingConflicts })),
    };
    uc = new PreviewProjectImportUC(
      repo as unknown as ProjectRepository,
      events as unknown as EventServicePort,
      auth as unknown as AuthServicePort,
      createProject as unknown as CreateProjectUC,
      activeSubmissions as unknown as CheckActiveSubmissionByEmailsUC,
    );
  });

  const preview = (rows: ProjectImportRowInput[]) =>
    uc.execute({ eventId: EVENT_ID, rows });

  it('reports a valid row as CREATE with its participants and can be confirmed', async () => {
    const res = await preview([
      row(2, {
        categoryName: '  ingenieria de SISTEMAS ',
        state: 'UNDER_REVIEW',
        participants: [
          student('ANA@uni.edu', '1'),
          student('luis@uni.edu', '2'),
        ],
        tutorEmails: ['profe@uni.edu'],
      }),
    ]);

    expect(res.rows).toEqual([
      {
        rowNumber: 2,
        outcome: 'CREATE',
        message: 'Se creará con 2 integrantes (1 sin cuenta).',
        projectName: 'Proyecto 2',
        categoryName: SISTEMAS.name,
        state: 'UNDER_REVIEW',
        participants: [
          { email: 'ana@uni.edu', status: 'HAS_ACCOUNT' },
          { email: 'luis@uni.edu', status: 'NO_ACCOUNT' },
        ],
      },
    ]);
    expect(res.totals).toEqual({
      rows: 1,
      toCreate: 1,
      skipped: 0,
      errors: 0,
      participants: 2,
      withoutAccount: 1,
    });
    expect(res).toMatchObject({ eventWarnings: [], canConfirm: true });
  });

  it('keeps the plan of a CREATE row: category, APPROVED by default and the linked tutors', async () => {
    const { plans } = await uc.evaluate({
      eventId: EVENT_ID,
      rows: [row(2, { tutorEmails: ['Profe@uni.edu', 'profe@uni.edu'] })],
    });

    expect(plans).toEqual([
      {
        courseId: SISTEMAS.id,
        nrc: '1001',
        state: 'APPROVED',
        tutorUserIds: [PROFE.id],
      },
    ]);
  });

  it('reports the format errors of the gateway and does not validate the row further', async () => {
    const res = await preview([
      row(4, {
        categoryName: 'No existe',
        formatErrors: [
          'Integrante 2 a medias: falta el correo.',
          'Estado desconocido.',
        ],
      }),
    ]);

    expect(res.rows[0]).toMatchObject({
      outcome: 'ERROR',
      message: 'Integrante 2 a medias: falta el correo. Estado desconocido.',
    });
    expect(res.canConfirm).toBe(false);
  });

  describe('rule 1: required fields, lengths and emails', () => {
    it.each([
      [
        'no category',
        { categoryName: ' ' },
        'Falta el dato obligatorio: Categoría.',
      ],
      [
        'no NRC in an event that requires it',
        { nrc: '' },
        'Falta el dato obligatorio: NRC.',
      ],
      [
        'no first student',
        { participants: [] },
        'Falta el dato obligatorio: Integrante 1.',
      ],
      [
        'several missing fields',
        {
          name: '',
          participants: [{ ...student('a@uni.edu', ''), career: '' }],
        },
        'Faltan los datos obligatorios: Nombre del proyecto, Código estudiantil integrante 1, Carrera integrante 1.',
      ],
      [
        'a name too short',
        { name: ' ab ' },
        'El nombre del proyecto debe tener entre 3 y 255 caracteres.',
      ],
      [
        'a name too long',
        { name: 'x'.repeat(256) },
        'El nombre del proyecto debe tener entre 3 y 255 caracteres.',
      ],
      [
        'a description too long',
        { description: 'x'.repeat(3001) },
        'La descripción no puede pasar de 3000 caracteres.',
      ],
      [
        'a project code with letters',
        { projectCode: 'ABC-1' },
        'El código del proyecto «ABC-1» debe tener solo números.',
      ],
      [
        'a project code too long',
        { projectCode: '1'.repeat(51) },
        'El código del proyecto no puede pasar de 50 caracteres.',
      ],
      [
        'a student code too long',
        { participants: [student('a@uni.edu', '1'.repeat(21))] },
        'El código estudiantil del integrante 1 no puede pasar de 20 caracteres.',
      ],
      [
        'a student last name too long',
        {
          participants: [
            { ...student('a@uni.edu', '1'), lastName: 'x'.repeat(101) },
          ],
        },
        'El nombre y el apellido del integrante 1 no pueden pasar de 100 caracteres.',
      ],
      [
        'an invalid student email',
        { participants: [student('ana@', '1')] },
        'El correo «ana@» del integrante 1 no es válido.',
      ],
      [
        'only student 2 filled in the sheet',
        { participants: [{ ...student('a@uni.edu', '1'), slot: 2 }] },
        'Falta el dato obligatorio: Integrante 1.',
      ],
      [
        'an invalid email in student 3 of the sheet, numbered as in the sheet',
        {
          participants: [
            { ...student('a@uni.edu', '1'), slot: 1 },
            { ...student('b@', '2'), slot: 3 },
          ],
        },
        'El correo «b@» del integrante 3 no es válido.',
      ],
      [
        'an email repeated in the row',
        {
          participants: [student('a@uni.edu', '1'), student('A@uni.edu', '2')],
        },
        'El correo a@uni.edu está repetido entre los integrantes.',
      ],
      [
        'a student code repeated in the row',
        {
          participants: [student('a@uni.edu', '1'), student('b@uni.edu', '1')],
        },
        'El código estudiantil 1 está repetido entre los integrantes.',
      ],
      [
        'an invalid tutor email',
        { tutorEmails: ['profe@'] },
        'El correo de tutor «profe@» no es válido.',
      ],
    ])('rejects a row with %s', async (_, change, message) => {
      const res = await preview([row(2, change)]);

      expect(res.rows[0]).toMatchObject({ outcome: 'ERROR', message });
      expect(res.totals.errors).toBe(1);
      expect(res.canConfirm).toBe(false);
    });

    it('does not ask for the NRC when the event does not require a course', async () => {
      event.requiresCourse = false;

      const res = await preview([row(2, { nrc: '' })]);

      expect(res.rows[0].outcome).toBe('CREATE');
      expect(createProject.resolveAcademicCourse).not.toHaveBeenCalled();
    });

    it('drops a written NRC when the event does not use one', async () => {
      event.requiresCourse = false;

      const { preview: res, plans } = await uc.evaluate({
        eventId: EVENT_ID,
        rows: [row(2, { nrc: '9999' })],
      });

      expect(res.rows[0].outcome).toBe('CREATE');
      expect(plans[0]?.nrc).toBeUndefined();
      expect(createProject.resolveAcademicCourse).not.toHaveBeenCalled();
    });

    it('keeps the NRC in the plan when the event uses one', async () => {
      const { plans } = await uc.evaluate({
        eventId: EVENT_ID,
        rows: [row(2, { nrc: ' 1001 ' })],
      });

      expect(plans[0]?.nrc).toBe('1001');
    });
  });

  describe('rule 2: category of the event', () => {
    it('rejects a category that is not in the event', async () => {
      const res = await preview([row(2, { categoryName: 'Medicina' })]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'ERROR',
        message: 'La categoría «Medicina» no existe en este evento.',
      });
    });

    it('rejects an inactive category', async () => {
      const res = await preview([row(2, { categoryName: OLD.name })]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'ERROR',
        message: `La categoría «${OLD.name}» no existe en este evento.`,
      });
    });
  });

  describe('rule 3: NRC in the term of the event', () => {
    it('rejects an NRC that does not resolve and looks up each NRC once', async () => {
      const res = await preview([
        row(2, { nrc: '9999' }),
        row(3, { nrc: '9999' }),
        row(4, { nrc: '1001' }),
      ]);

      expect(res.rows.map((r) => [r.outcome, r.message])).toEqual([
        ['ERROR', 'El NRC 9999 no existe en el periodo del evento.'],
        ['ERROR', 'El NRC 9999 no existe en el periodo del evento.'],
        ['CREATE', 'Se creará con 1 integrante (1 sin cuenta).'],
      ]);
      expect(createProject.resolveAcademicCourse).toHaveBeenCalledTimes(2);
      expect(createProject.resolveAcademicCourse).toHaveBeenCalledWith(
        7,
        '9999',
      );
    });
  });

  describe('rule 4: name of the project', () => {
    it('skips a row whose name exists in the same category, without checking its emails', async () => {
      projects = [existing(40, 'Robot', SISTEMAS.id)];
      pendingConflicts = [{ email: 'e2@uni.edu', projectId: 40 }];

      const res = await preview([row(2, { name: ' Robot ' }), row(3)]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'SKIP',
        projectId: 40,
        projectName: 'Robot',
        categoryName: SISTEMAS.name,
        message: 'Ya existe en el evento (Id 40); se omite.',
      });
      expect(res.totals).toMatchObject({ toCreate: 1, skipped: 1, errors: 0 });
      expect(res.canConfirm).toBe(true);
    });

    it('skips a row whose project is in a category deactivated after the load', async () => {
      projects = [existing(40, 'Robot', OLD.id)];

      const res = await preview([
        row(2, { name: 'Robot', categoryName: OLD.name }),
        row(3),
      ]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'SKIP',
        projectId: 40,
        categoryName: OLD.name,
      });
      expect(res.canConfirm).toBe(true);
    });

    it('rejects a name that exists in another category of the event, naming it', async () => {
      projects = [existing(40, 'Robot', CIVIL.id)];

      const res = await preview([row(2, { name: 'Robot' })]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'ERROR',
        message:
          'Ya existe un proyecto con ese nombre en la categoría «Ingeniería Civil» de este evento (Id 40).',
      });
    });

    it('compares the name as the creation does: another case is another name', async () => {
      projects = [existing(40, 'Robot', SISTEMAS.id)];

      const res = await preview([row(2, { name: 'robot' })]);

      expect(res.rows[0].outcome).toBe('CREATE');
    });

    it('rejects the second row with a name repeated in the file', async () => {
      const res = await preview([
        row(2, { name: 'Robot' }),
        row(3, { name: 'Robot', categoryName: CIVIL.name }),
      ]);

      expect(res.rows.map((r) => r.outcome)).toEqual(['CREATE', 'ERROR']);
      expect(res.rows[1].message).toBe(
        'Nombre repetido: igual al proyecto de la fila 2.',
      );
    });

    it('is idempotent: a file already loaded is all SKIP and cannot be confirmed', async () => {
      const rows = [row(2), row(3, { categoryName: CIVIL.name })];
      projects = [
        existing(40, 'Proyecto 2', SISTEMAS.id),
        existing(41, 'Proyecto 3', CIVIL.id),
      ];
      pendingConflicts = [
        { email: 'e2@uni.edu', projectId: 40 },
        { email: 'e3@uni.edu', projectId: 41 },
      ];

      const res = await preview(rows);

      expect(res.rows.map((r) => [r.outcome, r.projectId])).toEqual([
        ['SKIP', 40],
        ['SKIP', 41],
      ]);
      expect(res.totals).toMatchObject({ toCreate: 0, skipped: 2, errors: 0 });
      expect(res.canConfirm).toBe(false);
    });
  });

  describe('rule 5: students', () => {
    it('rejects a student who is pending in another project of the event', async () => {
      projects = [existing(40, 'Robot', SISTEMAS.id)];
      pendingConflicts = [{ email: 'e2@uni.edu', projectId: 40 }];

      const res = await preview([row(2)]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'ERROR',
        message:
          'e2@uni.edu ya está en otro proyecto del evento: «Robot» (Id 40).',
      });
      expect(activeSubmissions.execute).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        emails: ['e2@uni.edu'],
      });
    });

    it('rejects a student with an account enrolled in another active project of the event', async () => {
      projects = [existing(40, 'Robot', SISTEMAS.id)];
      enrolledIn[ANA.id] = [
        {
          id: 99,
          eventId: 1,
          courseId: 1,
          name: 'Otro evento',
          state: 'APPROVED',
        },
        {
          id: 40,
          eventId: EVENT_ID,
          courseId: 3,
          name: 'Robot',
          state: 'APPROVED',
        },
      ];

      const res = await preview([
        row(2, { participants: [student('ana@uni.edu', '1')] }),
      ]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'ERROR',
        message:
          'ana@uni.edu ya está en otro proyecto del evento: «Robot» (Id 40).',
      });
      expect(repo.listProjectsByParticipant).toHaveBeenCalledWith(ANA.id, [
        'UNDER_REVIEW',
        'APPROVED',
        'REQUEST_CHANGES',
      ]);
    });

    it('rejects the second row of a student repeated in the file, with the first row', async () => {
      const res = await preview([
        row(2, { participants: [student('luis@uni.edu', '1')] }),
        row(3),
        row(5, { participants: [student(' LUIS@uni.edu', '2')] }),
      ]);

      expect(res.rows.map((r) => r.outcome)).toEqual([
        'CREATE',
        'CREATE',
        'ERROR',
      ]);
      expect(res.rows[2].message).toBe(
        'El correo luis@uni.edu ya está en el proyecto de la fila 2.',
      );
    });

    it('does not count the students of a SKIP row as repeated', async () => {
      projects = [existing(40, 'Robot', SISTEMAS.id)];
      pendingConflicts = [{ email: 'luis@uni.edu', projectId: 40 }];

      const res = await preview([
        row(2, { name: 'Robot', participants: [student('luis@uni.edu', '1')] }),
        row(3, { participants: [student('e3@uni.edu', '1')] }),
      ]);

      expect(res.rows.map((r) => r.outcome)).toEqual(['SKIP', 'CREATE']);
    });
  });

  describe('rule 6: tutors', () => {
    it.each([
      ['without an account', 'nadie@uni.edu'],
      ['without the Professor or Tutor role', 'otro@uni.edu'],
    ])('rejects a tutor %s', async (_, email) => {
      const res = await preview([row(2, { tutorEmails: [email] })]);

      expect(res.rows[0]).toMatchObject({
        outcome: 'ERROR',
        message: `El tutor ${email} no es un profesor ni un tutor activo de IRIS.`,
      });
    });
  });

  describe('rule 7: event warnings', () => {
    it.each([
      [{ active: false }, ['El evento está inactivo.']],
      [
        { resultsPublished: true },
        [
          'El evento ya publicó sus resultados: no se le pueden crear proyectos.',
        ],
      ],
    ])(
      'blocks the confirmation of an event with %o',
      async (change, warnings) => {
        Object.assign(event, change);

        const res = await preview([row(2)]);

        expect(res.rows[0].outcome).toBe('CREATE');
        expect(res.eventWarnings).toEqual(warnings);
        expect(res.canConfirm).toBe(false);
      },
    );

    it('does not warn about a closed inscription deadline', async () => {
      event.inscriptionDeadline = '2020-01-01T00:00:00.000Z';

      const res = await preview([row(2)]);

      expect(res).toMatchObject({ eventWarnings: [], canConfirm: true });
    });
  });

  describe('rule 8: account lookups', () => {
    it('looks up each email once with at most 10 lookups at a time', async () => {
      let running = 0;
      let peak = 0;
      auth.findUserByEmail.mockImplementation(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setImmediate(resolve));
        running--;
        return null;
      });
      const rows = Array.from({ length: 30 }, (_, i) => row(i + 2));
      rows.push(row(40, { participants: [student('e2@uni.edu', 'x')] }));

      await preview(rows);

      expect(auth.findUserByEmail).toHaveBeenCalledTimes(30);
      expect(peak).toBeLessThanOrEqual(10);
    });
  });

  it('rejects an empty file and one over the limit', async () => {
    await expect(preview([])).rejects.toBeInstanceOf(ValidationError);
    await expect(
      preview(
        Array.from({ length: MAX_PROJECT_IMPORT_ROWS + 1 }, (_, i) =>
          row(i + 2),
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('fails with NotFoundError when the event does not exist', async () => {
    events.getEventById.mockRejectedValue({ code: status.NOT_FOUND });

    await expect(preview([row(2)])).rejects.toBeInstanceOf(NotFoundError);
  });
});
