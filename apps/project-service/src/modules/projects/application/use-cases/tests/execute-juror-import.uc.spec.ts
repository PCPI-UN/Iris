import { ExecuteJurorImportUC } from '../execute-juror-import.uc';
import {
  JUROR_IMPORT_TUTOR_NOTE,
  JurorImportPreview,
  JurorImportRowInput,
  JurorImportRowResult,
  PreviewJurorImportUC,
} from '../preview-juror-import.uc';
import { ProjectRepository } from '../../../domain/repositories/project.repository';
import { PreconditionError } from '../../../domain/errors';
import { JUROR_ROLE_ID } from '../../../domain/entities/project.entity';

const EVENT_ID = 10;

const ROWS: JurorImportRowInput[] = [
  {
    rowNumber: 5,
    jurorSlot: 1,
    department: 'Dpt. Ingeniería Industrial',
    projectCode: '14',
    firstName: 'Ana',
    email: 'ana@x.co',
  },
];

const assign = (
  rowNumber: number,
  email: string,
  userStatus: JurorImportRowResult['userStatus'],
  extra: Partial<JurorImportRowResult> = {},
): JurorImportRowResult => ({
  rowNumber,
  jurorSlot: 1,
  outcome: 'ASSIGN',
  userStatus,
  message: 'Vista previa.',
  email,
  projectId: 100 + rowNumber,
  projectName: `Proyecto ${rowNumber}`,
  ...extra,
});

const previewOf = (
  rows: JurorImportRowResult[],
  overrides: Partial<JurorImportPreview> = {},
): JurorImportPreview => {
  const errors = rows.filter((r) => r.outcome === 'ERROR').length;
  const toAssign = rows.filter((r) => r.outcome === 'ASSIGN').length;
  return {
    rows,
    totals: {
      rows: rows.length,
      toAssign,
      skipped: rows.filter((r) => r.outcome === 'SKIP').length,
      errors,
      jurors: 0,
      newUsers: 0,
      invitesToEvent: 0,
    },
    eventWarnings: [],
    canConfirm: errors === 0 && toAssign > 0,
    ...overrides,
  };
};

describe('ExecuteJurorImportUC', () => {
  let preview: { execute: jest.Mock };
  let repo: { createAssignments: jest.Mock };
  let uc: ExecuteJurorImportUC;

  beforeEach(() => {
    preview = { execute: jest.fn() };
    repo = { createAssignments: jest.fn().mockResolvedValue(0) };
    uc = new ExecuteJurorImportUC(
      repo as unknown as ProjectRepository,
      preview as unknown as PreviewJurorImportUC,
    );
  });

  it('validates the same rows again before writing', async () => {
    preview.execute.mockResolvedValue(
      previewOf([assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 })]),
    );

    await uc.execute({ eventId: EVENT_ID, rows: ROWS });

    expect(preview.execute).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      rows: ROWS,
    });
  });

  it('assigns every row to assign in one write, with the juror role of the event', async () => {
    preview.execute.mockResolvedValue(
      previewOf([
        assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
        assign(6, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
        assign(7, 'laura@x.co', 'INVITE_TO_EVENT', { userId: 13 }),
      ]),
    );

    const result = await uc.execute({ eventId: EVENT_ID, rows: ROWS });

    expect(repo.createAssignments).toHaveBeenCalledTimes(1);
    expect(repo.createAssignments).toHaveBeenCalledWith(
      [
        [105, 11],
        [106, 11],
        [107, 13],
      ].map(([projectId, memberUserId]) => ({
        projectId,
        juror: {
          memberUserId,
          memberEventId: EVENT_ID,
          memberRoleId: JUROR_ROLE_ID,
        },
      })),
    );
    expect(result.totals).toEqual({
      rows: 3,
      assigned: 3,
      skipped: 0,
      errors: 0,
      jurors: 2,
    });
  });

  it('keeps the rows already assigned as skipped and does not write them', async () => {
    const skipped: JurorImportRowResult = {
      ...assign(6, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
      outcome: 'SKIP',
      message: 'Ya estaba asignado a este proyecto; se omite.',
    };
    preview.execute.mockResolvedValue(
      previewOf([
        assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
        skipped,
      ]),
    );

    const result = await uc.execute({ eventId: EVENT_ID, rows: ROWS });

    expect(repo.createAssignments.mock.calls[0][0]).toHaveLength(1);
    expect(result.rows[1]).toEqual(skipped);
    expect(result.totals).toMatchObject({ assigned: 1, skipped: 1 });
  });

  it('tells what was done in each assigned row and keeps the tutor warning', async () => {
    preview.execute.mockResolvedValue(
      previewOf([
        assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
        assign(6, 'laura@x.co', 'INVITE_TO_EVENT', {
          userId: 13,
          message: `Usuario existente.${JUROR_IMPORT_TUTOR_NOTE}`,
        }),
      ]),
    );

    const { rows } = await uc.execute({ eventId: EVENT_ID, rows: ROWS });

    expect(rows.map((r) => r.message)).toEqual([
      'Asignado.',
      `Asignado. Debe aceptar la invitación al evento para evaluar.${JUROR_IMPORT_TUTOR_NOTE}`,
    ]);
  });

  it('does not assign the jurors whose invitation failed and reports why', async () => {
    preview.execute.mockResolvedValue(
      previewOf([
        assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
        assign(6, 'laura@x.co', 'INVITE_TO_EVENT', { userId: 13 }),
        assign(7, 'laura@x.co', 'INVITE_TO_EVENT', { userId: 13 }),
      ]),
    );

    const result = await uc.execute({
      eventId: EVENT_ID,
      rows: ROWS,
      failedInvitations: [{ email: 'Laura@X.co', message: 'servicio caído' }],
    });

    expect(repo.createAssignments.mock.calls[0][0]).toEqual([
      expect.objectContaining({ projectId: 105 }),
    ]);
    expect(result.rows.slice(1)).toEqual(
      [6, 7].map((rowNumber) =>
        expect.objectContaining({
          rowNumber,
          outcome: 'ERROR',
          message:
            'No se asignó: no se pudo enviar la invitación al evento (servicio caído).',
        }),
      ),
    );
    expect(result.totals).toMatchObject({ assigned: 1, errors: 2, jurors: 1 });
  });

  it('does not assign a juror who still has no account', async () => {
    preview.execute.mockResolvedValue(
      previewOf([assign(5, 'nuevo@x.co', 'NEW_USER')]),
    );

    const result = await uc.execute({ eventId: EVENT_ID, rows: ROWS });

    expect(repo.createAssignments).toHaveBeenCalledWith([]);
    expect(result.rows[0]).toMatchObject({
      outcome: 'ERROR',
      message: 'No se asignó: el jurado no tiene cuenta en IRIS.',
    });
  });

  it('refuses a file with errors and writes nothing', async () => {
    preview.execute.mockResolvedValue(
      previewOf([
        assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
        { ...assign(6, 'x', undefined), outcome: 'ERROR' },
        { ...assign(7, 'y', undefined), outcome: 'ERROR' },
      ]),
    );

    await expect(uc.execute({ eventId: EVENT_ID, rows: ROWS })).rejects.toThrow(
      new PreconditionError(
        'No se puede ejecutar la asignación. Hay 2 jurados con error; corríjalos y vuelva a cargar el archivo.',
      ),
    );
    expect(repo.createAssignments).not.toHaveBeenCalled();
  });

  it('refuses an event that cannot receive jurors', async () => {
    preview.execute.mockResolvedValue(
      previewOf([assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 })], {
        eventWarnings: ['El evento está inactivo.'],
        canConfirm: false,
      }),
    );

    await expect(uc.execute({ eventId: EVENT_ID, rows: ROWS })).rejects.toThrow(
      'No se puede ejecutar la asignación. El evento está inactivo.',
    );
    expect(repo.createAssignments).not.toHaveBeenCalled();
  });

  it('refuses to run again a file already executed: nothing is duplicated', async () => {
    preview.execute.mockResolvedValue(
      previewOf([
        {
          ...assign(5, 'ana@x.co', 'EVENT_JUROR', { userId: 11 }),
          outcome: 'SKIP',
        },
      ]),
    );

    await expect(uc.execute({ eventId: EVENT_ID, rows: ROWS })).rejects.toThrow(
      'No se puede ejecutar la asignación. No hay jurados por asignar: todos ya estaban asignados.',
    );
    expect(repo.createAssignments).not.toHaveBeenCalled();
  });
});
