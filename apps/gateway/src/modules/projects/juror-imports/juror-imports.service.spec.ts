import { BadRequestException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import * as ExcelJS from 'exceljs';
import { of } from 'rxjs';
import { JurorImportsService } from './juror-imports.service';
import { InvitationsService } from '../../invitations/invitations.service';

async function template(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Asignación jurados');
  ws.addRow(['Asignación de jurados · Feria']);
  ws.addRow(['Leyenda']);
  ws.addRow([]);
  ws.addRow([
    'Departamento',
    'Número',
    'Nombre del proyecto',
    'Nombre(s) jurado 1',
    'Apellido(s) jurado 1',
    'Correo jurado 1',
  ]);
  ws.addRow([
    'Dpt. Ingeniería Industrial',
    14,
    '',
    'Laura',
    'Gómez',
    'Laura@X.co',
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const upload = (originalname: string, buffer: Buffer) =>
  ({ originalname, buffer, size: buffer.length }) as Express.Multer.File;

describe('JurorImportsService.preview', () => {
  // As the gateway project client delivers it: enums as strings, defaults filled
  // and a virtual "_field" key for each optional field that is set
  const response = {
    rows: [
      {
        rowNumber: 2,
        jurorSlot: 1,
        outcome: 'ASSIGN',
        userStatus: 'INVITE_TO_EVENT',
        message:
          'Usuario existente: recibirá la invitación al evento al confirmar.',
        email: 'laura@x.co',
        projectId: 195,
        _projectId: 'projectId',
        projectName: 'Modelo de asignación',
        _projectName: 'projectName',
        userId: 13,
        _userId: 'userId',
      },
      {
        rowNumber: 3,
        jurorSlot: 2,
        outcome: 'ERROR',
        userStatus: 'JUROR_IMPORT_USER_STATUS_UNSPECIFIED',
        message: 'El correo «x» no es válido.',
        email: 'x',
      },
    ],
    totals: {
      rows: 1,
      toAssign: 1,
      skipped: 0,
      errors: 0,
      jurors: 1,
      newUsers: 0,
      invitesToEvent: 1,
    },
    eventWarnings: [],
    canConfirm: true,
  };
  let previewJurorImport: jest.Mock;
  let getJurorImportTemplate: jest.Mock;
  let service: JurorImportsService;

  beforeEach(() => {
    previewJurorImport = jest.fn().mockReturnValue(of(response));
    getJurorImportTemplate = jest.fn().mockReturnValue(
      of({
        eventName: 'Feria',
        projects: [
          {
            projectId: 195,
            department: 'Dpt. Ingeniería Industrial',
            projectCode: '14',
            name: 'Modelo',
            members: ['Ana Ríos', 'Luis Mora'],
          },
        ],
      }),
    );
    const client = {
      getService: () => ({ previewJurorImport, getJurorImportTemplate }),
    } as unknown as ClientGrpc;
    service = new JurorImportsService(
      client,
      { getService: () => ({}) } as unknown as ClientGrpc,
      {} as InvitationsService,
    );
    service.onModuleInit();
  });

  it('sends the sheet rows to project-service as they were written', async () => {
    await service.preview(10, upload('jurados.XLSX', await template()));

    expect(previewJurorImport).toHaveBeenCalledWith({
      eventId: 10,
      rows: [
        {
          rowNumber: 5,
          department: 'Dpt. Ingeniería Industrial',
          projectCode: '14',
          firstName: 'Laura',
          lastName: 'Gómez',
          jurorSlot: 1,
          email: 'Laura@X.co',
        },
      ],
    });
  });

  it('returns only the fields of the contract', async () => {
    const result = await service.preview(
      10,
      upload('jurados.xlsx', await template()),
    );

    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        jurorSlot: 1,
        outcome: 'ASSIGN',
        userStatus: 'INVITE_TO_EVENT',
        message:
          'Usuario existente: recibirá la invitación al evento al confirmar.',
        email: 'laura@x.co',
        projectId: 195,
        projectName: 'Modelo de asignación',
        userId: 13,
      },
      {
        rowNumber: 3,
        jurorSlot: 2,
        outcome: 'ERROR',
        message: 'El correo «x» no es válido.',
        email: 'x',
      },
    ]);
    expect(result).toMatchObject({
      totals: response.totals,
      eventWarnings: [],
      canConfirm: true,
    });
  });

  it('asks for the file when none was uploaded', async () => {
    await expect(service.preview(10, undefined)).rejects.toThrow(
      new BadRequestException('Adjunte la plantilla .xlsx en el campo «file».'),
    );
  });

  it('rejects a file that is not .xlsx', async () => {
    await expect(
      service.preview(10, upload('jurados.xls', await template())),
    ).rejects.toThrow('El archivo debe ser .xlsx.');
    expect(previewJurorImport).not.toHaveBeenCalled();
  });

  it('builds the template of the event with the data of project-service', async () => {
    const { fileName, file } = await service.template(10);

    expect(getJurorImportTemplate).toHaveBeenCalledWith({ eventId: 10 });
    expect(fileName).toBe('plantilla-jurados-evento-10.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Asignación jurados')!;
    expect(ws.getCell('C8').value).toBe('Modelo');
    expect(ws.getCell('E8').value).toBe('Ana Ríos\nLuis Mora');
  });
});

describe('JurorImportsService.execute', () => {
  const INDUSTRIAL = 'Dpt. Ingeniería Industrial';

  /** Sheet with one juror per row: [number, first name, last name, email] */
  async function sheet(jurors: [number, string, string, string][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Asignación jurados');
    ws.addRow(['Asignación de jurados · Feria']);
    ws.addRow(['Leyenda']);
    ws.addRow([]);
    ws.addRow([
      'Departamento',
      'Número',
      'Nombre del proyecto',
      'Nombre(s) jurado 1',
      'Apellido(s) jurado 1',
      'Correo jurado 1',
    ]);
    for (const [code, first, last, email] of jurors) {
      ws.addRow([INDUSTRIAL, code, '', first, last, email]);
    }
    return upload('jurados.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
  }

  const row = (
    rowNumber: number,
    email: string,
    outcome: string,
    userStatus: string,
    userId?: number,
  ) => ({
    rowNumber,
    jurorSlot: 1,
    outcome,
    userStatus,
    message: 'Mensaje.',
    email,
    projectId: 100 + rowNumber,
    projectName: `Proyecto ${rowNumber}`,
    ...(userId ? { userId } : {}),
  });

  // Rows 5 and 6: Ana (new user) in two projects; 7: Laura (invite); 8: María (event juror)
  const FILE: [number, string, string, string][] = [
    [14, 'Ana', 'Pérez', 'ana@x.co'],
    [15, 'Ana', 'Pérez', 'ana@x.co'],
    [16, 'Laura', '', 'laura@x.co'],
    [17, 'María', 'Torres', 'maria@x.co'],
  ];
  const PREVIEW = {
    rows: [
      row(5, 'ana@x.co', 'ASSIGN', 'NEW_USER'),
      row(6, 'ana@x.co', 'ASSIGN', 'NEW_USER'),
      row(7, 'laura@x.co', 'ASSIGN', 'INVITE_TO_EVENT', 13),
      row(8, 'maria@x.co', 'ASSIGN', 'EVENT_JUROR', 14),
    ],
    totals: {
      rows: 4,
      toAssign: 4,
      skipped: 0,
      errors: 0,
      jurors: 3,
      newUsers: 1,
      invitesToEvent: 1,
    },
    eventWarnings: [],
    canConfirm: true,
  };
  // After the invitations Ana already has an account: project-service sees her as INVITE_TO_EVENT
  const EXECUTION = {
    rows: [
      row(5, 'ana@x.co', 'ASSIGN', 'INVITE_TO_EVENT', 20),
      row(6, 'ana@x.co', 'ASSIGN', 'INVITE_TO_EVENT', 20),
      row(7, 'laura@x.co', 'ASSIGN', 'INVITE_TO_EVENT', 13),
      row(8, 'maria@x.co', 'ASSIGN', 'EVENT_JUROR', 14),
    ],
    totals: { rows: 4, assigned: 4, skipped: 0, errors: 0, jurors: 3 },
  };

  let previewJurorImport: jest.Mock;
  let executeJurorImport: jest.Mock;
  let getEvent: jest.Mock;
  let inviteJurorToEvent: jest.Mock;
  let service: JurorImportsService;

  beforeEach(() => {
    previewJurorImport = jest.fn().mockReturnValue(of(PREVIEW));
    executeJurorImport = jest.fn().mockReturnValue(of(EXECUTION));
    getEvent = jest
      .fn()
      .mockReturnValue(of({ event: { eventType: 'COMPETENCIA' } }));
    inviteJurorToEvent = jest.fn().mockResolvedValue({});
    service = new JurorImportsService(
      {
        getService: () => ({ previewJurorImport, executeJurorImport }),
      } as unknown as ClientGrpc,
      { getService: () => ({ getEvent }) } as unknown as ClientGrpc,
      { inviteJurorToEvent } as unknown as InvitationsService,
    );
    service.onModuleInit();
  });

  it('invites once each juror who is not in the event yet, with the name of the sheet', async () => {
    await service.execute(10, await sheet(FILE), 99);

    expect(inviteJurorToEvent).toHaveBeenCalledTimes(2);
    expect(inviteJurorToEvent).toHaveBeenCalledWith(
      10,
      {
        email: 'ana@x.co',
        firstName: 'Ana',
        lastName: 'Pérez',
        eventType: 'Competition',
      },
      99,
    );
    expect(inviteJurorToEvent).toHaveBeenCalledWith(
      10,
      {
        email: 'laura@x.co',
        firstName: 'Laura',
        lastName: undefined,
        eventType: 'Competition',
      },
      99,
    );
  });

  it('assigns after inviting, sending the same rows of the file', async () => {
    const order: string[] = [];
    inviteJurorToEvent.mockImplementation(async () => order.push('invite'));
    executeJurorImport.mockImplementation(() => {
      order.push('execute');
      return of(EXECUTION);
    });

    await service.execute(10, await sheet(FILE), 99);

    expect(order).toEqual(['invite', 'invite', 'execute']);
    const request = executeJurorImport.mock.calls[0][0];
    expect(request.eventId).toBe(10);
    expect(request.failedInvitations).toEqual([]);
    expect(request.rows).toEqual(previewJurorImport.mock.calls[0][0].rows);
  });

  it('returns the summary, keeping the jurors created now as new users', async () => {
    const result = await service.execute(10, await sheet(FILE), 99);

    expect(result.rows.map((r) => [r.rowNumber, r.userStatus])).toEqual([
      [5, 'NEW_USER'],
      [6, 'NEW_USER'],
      [7, 'INVITE_TO_EVENT'],
      [8, 'EVENT_JUROR'],
    ]);
    expect(result.totals).toEqual({
      rows: 4,
      assigned: 4,
      skipped: 0,
      errors: 0,
      jurors: 3,
      invitationsSent: 2,
      newUsers: 1,
    });
  });

  it('reports the jurors whose invitation failed to project-service and assigns the rest', async () => {
    inviteJurorToEvent.mockImplementation(async (_eventId, dto) => {
      if (dto.email === 'laura@x.co') {
        throw {
          code: 6,
          details: 'El usuario ya aceptó una invitación para este evento',
        };
      }
    });

    const result = await service.execute(10, await sheet(FILE), 99);

    expect(executeJurorImport.mock.calls[0][0].failedInvitations).toEqual([
      {
        email: 'laura@x.co',
        message: 'El usuario ya aceptó una invitación para este evento',
      },
    ]);
    expect(result.totals).toMatchObject({ invitationsSent: 1, newUsers: 1 });
  });

  it('does nothing with a file that cannot be confirmed and answers with its preview', async () => {
    const preview = {
      ...PREVIEW,
      rows: [row(5, 'x', 'ERROR', 'JUROR_IMPORT_USER_STATUS_UNSPECIFIED')],
      canConfirm: false,
    };
    previewJurorImport.mockReturnValue(of(preview));

    const error = await service
      .execute(10, await sheet(FILE), 99)
      .catch((e: BadRequestException) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message:
        'No se puede ejecutar la asignación: la carga tiene errores o avisos. Revise la vista previa.',
      preview: {
        canConfirm: false,
        rows: [{ rowNumber: 5, outcome: 'ERROR' }],
      },
    });
    expect(inviteJurorToEvent).not.toHaveBeenCalled();
    expect(executeJurorImport).not.toHaveBeenCalled();
  });

  it('does not look up the event when nobody has to be invited', async () => {
    previewJurorImport.mockReturnValue(
      of({
        ...PREVIEW,
        rows: [row(8, 'maria@x.co', 'ASSIGN', 'EVENT_JUROR', 14)],
      }),
    );

    await service.execute(10, await sheet(FILE), 99);

    expect(getEvent).not.toHaveBeenCalled();
    expect(inviteJurorToEvent).not.toHaveBeenCalled();
    expect(executeJurorImport).toHaveBeenCalled();
  });

  it('asks for the file when none was uploaded', async () => {
    await expect(service.execute(10, undefined, 99)).rejects.toThrow(
      'Adjunte la plantilla .xlsx en el campo «file».',
    );
  });
});
