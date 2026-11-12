import { status } from '@grpc/grpc-js';
import {
  JurorImportRowInput,
  MAX_JUROR_IMPORT_ROWS,
  PreviewJurorImportUC,
} from '../preview-juror-import.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { EventServicePort } from '../../ports/event-service.port';
import { AuthServicePort, AuthUser } from '../../ports/auth-service.port';
import { NotFoundError, ValidationError } from '../../../domain/errors';
import {
  ProjectState,
  ProjectWithJurorIds,
} from '../../../domain/entities/project.entity';

const EVENT_ID = 10;
const CIVIL = 'Dpt. Ingeniería Civil y Ambiental';
const INDUSTRIAL = 'Dpt. Ingeniería Industrial';
const SISTEMAS = 'Dpt. Ingeniería de Sistemas y Computación';

const project = (
  id: number,
  courseId: number,
  projectCode: string,
  state: ProjectState,
  jurorUserIds: number[] = [],
): ProjectWithJurorIds => ({
  id,
  eventId: EVENT_ID,
  courseId,
  projectCode,
  name: `Proyecto ${id}`,
  state,
  jurorUserIds,
});

const user = (id: number, email: string): AuthUser => ({
  id,
  firstName: email.split('@')[0],
  email,
  status: 'CONFIRMED',
});

const ANA = user(11, 'ana.perez@uninorte.edu.co');
const CARLOS = user(12, 'carlos.mejia@uninorte.edu.co');
const LAURA = user(13, 'lrodriguez@consultoravial.com');
const MARIA = user(14, 'mtorres@uninorte.edu.co');

/** Memberships in the event: Ana and María are jurors (role 4), Carlos is a participant (role 5) */
const MEMBER_ROLES: Record<number, number> = { 11: 4, 12: 5, 14: 4 };

/** `jurorName` is split into first name (first word) and last name (the rest) */
const row = (
  rowNumber: number,
  department: string,
  projectCode: string,
  jurorName: string,
  email: string,
  jurorSlot = 1,
): JurorImportRowInput => {
  const [firstName, ...rest] = jurorName.split(' ');
  return {
    rowNumber,
    jurorSlot,
    department,
    projectCode,
    firstName,
    lastName: rest.join(' '),
    email,
  };
};

/** The nine example rows of the delivered template */
const TEMPLATE_ROWS = [
  row(2, CIVIL, '5', 'Ana Pérez Ríos', 'ana.perez@uninorte.edu.co'),
  row(3, CIVIL, '5', 'Jorge Gómez Lara', 'jgomez@estructurascaribe.co'),
  row(4, CIVIL, '5', 'Carlos Mejía Ortiz', 'carlos.mejia@uninorte.edu.co'),
  row(5, CIVIL, '6', 'Jorge Gómez Lara', 'jgomez@estructurascaribe.co'),
  row(6, CIVIL, '6', 'Ana Pérez Ríos', 'ana.perez@uninorte.edu.co'),
  row(
    7,
    INDUSTRIAL,
    '14',
    'Laura Rodríguez Gil',
    'lrodriguez@consultoravial.com',
  ),
  row(
    8,
    INDUSTRIAL,
    '14',
    'Carlos Mejía Ortiz',
    'carlos.mejia@uninorte.edu.co',
  ),
  row(9, SISTEMAS, '14', 'María Torres Vega', 'mtorres@uninorte.edu.co'),
  row(
    10,
    SISTEMAS,
    '14',
    'Laura Rodríguez Gil',
    'lrodriguez@consultoravial.com',
  ),
];

describe('PreviewJurorImportUC', () => {
  let repo: {
    listWithJurorsByEvent: jest.Mock;
    listTutorLinksByProjects: jest.Mock;
    listPendingTutorsByProjects: jest.Mock;
  };
  let events: {
    getEventById: jest.Mock;
    listCategoriesByEvent: jest.Mock;
    getEventMember: jest.Mock;
  };
  let auth: { findUserByEmail: jest.Mock };
  let useCase: PreviewJurorImportUC;

  beforeEach(() => {
    repo = {
      listWithJurorsByEvent: jest
        .fn()
        .mockResolvedValue([
          project(184, 1, '5', 'APPROVED', [ANA.id]),
          project(183, 1, '6', 'APPROVED'),
          project(195, 2, '14', 'APPROVED'),
          project(190, 3, '14', 'UNDER_REVIEW'),
        ]),
      // Carlos (12) is a linked tutor of project 183; a pending tutor of 195 has no account yet
      listTutorLinksByProjects: jest
        .fn()
        .mockResolvedValue([{ projectId: 183, userId: CARLOS.id }]),
      listPendingTutorsByProjects: jest.fn().mockResolvedValue([
        {
          projectId: 195,
          firstName: 'Nuevo',
          lastName: 'Tutor',
          email: 'nuevo.tutor@x.co',
          status: 'INVITED',
        },
      ]),
    };
    events = {
      getEventById: jest.fn().mockResolvedValue({
        id: EVENT_ID,
        active: true,
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      listCategoriesByEvent: jest.fn().mockResolvedValue([
        { id: 1, name: CIVIL, active: true },
        { id: 2, name: INDUSTRIAL, active: true },
        { id: 3, name: SISTEMAS, active: true },
      ]),
      getEventMember: jest.fn((userId: number) =>
        Promise.resolve(
          MEMBER_ROLES[userId]
            ? { userId, eventId: EVENT_ID, roleId: MEMBER_ROLES[userId] }
            : null,
        ),
      ),
    };
    const users = [ANA, CARLOS, LAURA, MARIA];
    auth = {
      findUserByEmail: jest.fn((email: string) =>
        Promise.resolve(users.find((u) => u.email === email) ?? null),
      ),
    };
    useCase = new PreviewJurorImportUC(
      repo as unknown as ProjectRepository,
      events as unknown as EventServicePort,
      auth as unknown as AuthServicePort,
    );
  });

  const preview = (rows: JurorImportRowInput[]) =>
    useCase.execute({ eventId: EVENT_ID, rows });

  it('warns when the juror is a tutor of the project, without blocking', async () => {
    // Carlos is a participant of the event (role 5): make him a juror just for this test
    const original = MEMBER_ROLES[CARLOS.id];
    MEMBER_ROLES[CARLOS.id] = 4;
    const result = await preview([
      row(2, CIVIL, '6', 'Carlos Mejía', CARLOS.email),
      row(3, INDUSTRIAL, '14', 'Nuevo Tutor', 'Nuevo.Tutor@x.co'),
      row(4, CIVIL, '5', 'Carlos Mejía', CARLOS.email),
    ]);
    MEMBER_ROLES[CARLOS.id] = original;

    const [linked, pending, other] = result.rows;
    expect(linked.outcome).toBe('ASSIGN');
    expect(linked.message).toContain('Aviso: es tutor de este proyecto.');
    expect(pending.outcome).toBe('ASSIGN');
    expect(pending.message).toContain('Aviso: es tutor de este proyecto.');
    // same person in a project where they are not tutor: no warning
    expect(other.message).not.toContain('tutor');
    expect(result.canConfirm).toBe(true);
  });

  it('reports every example row of the template', async () => {
    const result = await preview(TEMPLATE_ROWS);

    expect(
      result.rows.map((r) => [r.rowNumber, r.outcome, r.userStatus, r.message]),
    ).toEqual([
      [
        2,
        'SKIP',
        'EVENT_JUROR',
        'Ya estaba asignado a este proyecto; se omite.',
      ],
      [
        3,
        'ASSIGN',
        'NEW_USER',
        'Jurado nuevo: se creará su cuenta y recibirá la invitación al confirmar.',
      ],
      [
        4,
        'ERROR',
        undefined,
        'carlos.mejia@uninorte.edu.co ya está en este evento con otro rol; no puede ser jurado.',
      ],
      [
        5,
        'ASSIGN',
        'NEW_USER',
        'Jurado nuevo: se creará su cuenta y recibirá la invitación al confirmar.',
      ],
      [6, 'ASSIGN', 'EVENT_JUROR', 'Jurado del evento.'],
      [
        7,
        'ASSIGN',
        'INVITE_TO_EVENT',
        'Usuario existente: recibirá la invitación al evento al confirmar.',
      ],
      [
        8,
        'ERROR',
        undefined,
        'carlos.mejia@uninorte.edu.co ya está en este evento con otro rol; no puede ser jurado.',
      ],
      [
        9,
        'ERROR',
        undefined,
        `El proyecto 14 de «${SISTEMAS}» no está aprobado (estado: en revisión).`,
      ],
      [
        10,
        'ERROR',
        undefined,
        `El proyecto 14 de «${SISTEMAS}» no está aprobado (estado: en revisión).`,
      ],
    ]);
    expect(result.rows[1]).toMatchObject({
      projectId: 184,
      projectName: 'Proyecto 184',
    });
    expect(result.rows[4]).toMatchObject({ projectId: 183, userId: ANA.id });
    expect(result.totals).toEqual({
      rows: 9,
      toAssign: 4,
      skipped: 1,
      errors: 4,
      jurors: 3,
      newUsers: 1,
      invitesToEvent: 1,
    });
    expect(result.eventWarnings).toEqual([]);
    expect(result.canConfirm).toBe(false);
  });

  it('looks up each distinct email once', async () => {
    await preview(TEMPLATE_ROWS);

    expect(auth.findUserByEmail).toHaveBeenCalledTimes(5);
    // Jorge has no account, so only the four existing users need their membership
    expect(events.getEventMember).toHaveBeenCalledTimes(4);
  });

  it('can be confirmed when every row is assignable and the event is open', async () => {
    const result = await preview([
      row(2, CIVIL, '6', 'Ana Pérez Ríos', 'ana.perez@uninorte.edu.co'),
      row(
        3,
        INDUSTRIAL,
        '14',
        'Jorge Gómez Lara',
        'jgomez@estructurascaribe.co',
      ),
      row(4, CIVIL, '5', 'Ana Pérez Ríos', 'ana.perez@uninorte.edu.co'),
    ]);

    expect(result.totals).toMatchObject({ toAssign: 2, skipped: 1, errors: 0 });
    expect(result.canConfirm).toBe(true);
  });

  it('matches emails without case and spaces', async () => {
    const result = await preview([
      row(2, CIVIL, '6', 'Ana', '  Ana.Perez@Uninorte.edu.co '),
    ]);

    expect(result.rows[0]).toMatchObject({
      outcome: 'ASSIGN',
      userStatus: 'EVENT_JUROR',
      email: 'ana.perez@uninorte.edu.co',
      userId: ANA.id,
    });
    expect(auth.findUserByEmail).toHaveBeenCalledWith(
      'ana.perez@uninorte.edu.co',
    );
  });

  it('matches departments without accents, case or extra spaces', async () => {
    const result = await preview([
      row(2, '  dpt.  ingenieria   civil y ambiental ', '6', 'Ana', ANA.email),
    ]);

    expect(result.rows[0]).toMatchObject({ outcome: 'ASSIGN', projectId: 183 });
  });

  it('treats "05" and "5" as the same project number', async () => {
    const result = await preview([row(2, CIVIL, '06', 'Ana', ANA.email)]);

    expect(result.rows[0]).toMatchObject({ outcome: 'ASSIGN', projectId: 183 });
  });

  it('lists the missing required fields', async () => {
    const result = await preview([
      row(2, CIVIL, '', 'Ana', ANA.email),
      row(3, '', '', 'Ana', ''),
    ]);

    expect(result.rows.map((r) => r.message)).toEqual([
      'Falta el dato obligatorio: Número.',
      'Faltan los datos obligatorios: Departamento, Número, Correo del jurado 1.',
    ]);
  });

  it('rejects an invalid email', async () => {
    const result = await preview([
      row(2, CIVIL, '6', 'Ana', 'ana.perez@uninorte'),
    ]);

    expect(result.rows[0]).toMatchObject({
      outcome: 'ERROR',
      message: 'El correo «ana.perez@uninorte» del jurado 1 no es válido.',
    });
    expect(auth.findUserByEmail).not.toHaveBeenCalled();
  });

  // Typos that auth-service rejects: before, they made the whole preview fail
  it.each([
    'ana@uninorte,edu.co',
    'ana@uninorte.edu.co.',
    'ana..perez@uninorte.edu.co',
  ])('rejects %s on its row without asking auth-service', async (email) => {
    const result = await preview([row(2, CIVIL, '6', 'Ana', email)]);

    expect(result.rows[0]).toMatchObject({
      outcome: 'ERROR',
      message: `El correo «${email}» del jurado 1 no es válido.`,
    });
    expect(auth.findUserByEmail).not.toHaveBeenCalled();
  });

  it('marks a repeated row as an error and keeps the first one', async () => {
    const result = await preview([
      row(2, CIVIL, '6', 'Ana', ANA.email),
      row(3, CIVIL, '6', 'Ana Pérez', 'ANA.PEREZ@uninorte.edu.co'),
    ]);

    expect(result.rows[0].outcome).toBe('ASSIGN');
    expect(result.rows[1]).toMatchObject({
      outcome: 'ERROR',
      message: 'Jurado repetido: igual al jurado 1 de la fila 2.',
    });
  });

  it('rejects the same email twice in one sheet row', async () => {
    const result = await preview([
      row(5, CIVIL, '6', 'Laura', LAURA.email, 1),
      row(5, CIVIL, '6', 'Laura R', LAURA.email, 3),
    ]);

    expect(result.rows[0].outcome).toBe('ASSIGN');
    expect(result.rows[1]).toMatchObject({
      jurorSlot: 3,
      outcome: 'ERROR',
      message: `El correo ${LAURA.email} ya está en el jurado 1 de esta fila.`,
    });
  });

  it('accepts a juror without last name and keeps the juror slot in the result', async () => {
    const result = await preview([
      { ...row(7, CIVIL, '6', 'Laura', LAURA.email, 2), lastName: undefined },
    ]);

    expect(result.rows[0]).toMatchObject({ rowNumber: 7, jurorSlot: 2 });
    expect(result.rows[0].outcome).toBe('ASSIGN');
  });

  it('names the juror slot of a missing first name', async () => {
    const result = await preview([
      { ...row(7, CIVIL, '6', 'x', LAURA.email, 4), firstName: ' ' },
    ]);

    expect(result.rows[0].message).toBe(
      'Falta el dato obligatorio: Nombre(s) del jurado 4.',
    );
  });

  it('rejects a department that is not a category of the event', async () => {
    const result = await preview([
      row(2, 'Dpt. Ing. Civil', '5', 'Ana', ANA.email),
    ]);

    expect(result.rows[0].message).toBe(
      'El departamento «Dpt. Ing. Civil» no existe en este evento.',
    );
  });

  it('rejects a number without project in the department', async () => {
    const result = await preview([row(2, CIVIL, '7', 'Ana', ANA.email)]);

    expect(result.rows[0].message).toBe(
      `No hay proyecto con número 7 en «${CIVIL}».`,
    );
  });

  it('rejects a number shared by several projects of the department', async () => {
    repo.listWithJurorsByEvent.mockResolvedValue([
      project(184, 1, '5', 'APPROVED'),
      project(187, 1, '5', 'APPROVED'),
    ]);

    const result = await preview([row(2, CIVIL, '5', 'Ana', ANA.email)]);

    expect(result.rows[0].message).toBe(
      `Hay 2 proyectos con número 5 en «${CIVIL}» (Id 184, 187). Corrija el número en IRIS antes de cargar.`,
    );
  });

  it('warns and blocks the confirmation when the event is inactive or ended', async () => {
    events.getEventById.mockResolvedValue({
      id: EVENT_ID,
      active: false,
      endDate: '2026-10-30T23:00:00.000Z',
    });

    const result = await preview([row(2, CIVIL, '6', 'Ana', ANA.email)]);

    expect(result.totals.errors).toBe(0);
    expect(result.eventWarnings).toEqual([
      'El evento está inactivo.',
      'El evento ya terminó (fecha de fin: 30/10/2026).',
    ]);
    expect(result.canConfirm).toBe(false);
  });

  it('fails with NotFoundError when the event does not exist', async () => {
    events.getEventById.mockRejectedValue({ code: status.NOT_FOUND });

    await expect(preview(TEMPLATE_ROWS)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an empty file and more rows than the limit', async () => {
    await expect(preview([])).rejects.toBeInstanceOf(ValidationError);

    const tooMany = Array.from({ length: MAX_JUROR_IMPORT_ROWS + 1 }, (_, i) =>
      row(i + 2, CIVIL, '6', 'Ana', ANA.email),
    );
    await expect(preview(tooMany)).rejects.toThrow(
      `El archivo tiene ${MAX_JUROR_IMPORT_ROWS + 1} jurados con datos; el máximo es ${MAX_JUROR_IMPORT_ROWS}.`,
    );
  });
});
