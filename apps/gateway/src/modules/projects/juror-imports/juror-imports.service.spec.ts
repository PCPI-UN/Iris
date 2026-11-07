import { BadRequestException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import * as ExcelJS from 'exceljs';
import { of } from 'rxjs';
import { JurorImportsService } from './juror-imports.service';

async function template(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Asignaciones');
  ws.addRow([
    'Departamento*',
    'Número*',
    'Nombre proyecto (auto)',
    'Jurado*',
    'Email*',
  ]);
  ws.addRow(['Dpt. Ingeniería Industrial', 14, '', 'Laura', 'Laura@X.co']);
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
  let service: JurorImportsService;

  beforeEach(() => {
    previewJurorImport = jest.fn().mockReturnValue(of(response));
    const client = {
      getService: () => ({ previewJurorImport }),
    } as unknown as ClientGrpc;
    service = new JurorImportsService(client);
    service.onModuleInit();
  });

  it('sends the sheet rows to project-service as they were written', async () => {
    await service.preview(10, upload('jurados.XLSX', await template()));

    expect(previewJurorImport).toHaveBeenCalledWith({
      eventId: 10,
      rows: [
        {
          rowNumber: 2,
          department: 'Dpt. Ingeniería Industrial',
          projectCode: '14',
          jurorName: 'Laura',
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
});
