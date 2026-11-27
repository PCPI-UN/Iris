import { BadRequestException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import * as ExcelJS from 'exceljs';
import { of } from 'rxjs';
import { ProjectImportsService } from './project-imports.service';

async function filledTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Proyectos');
  ws.addRow(['Proyectos · Feria']);
  ws.addRow([
    'Categoría*',
    'Nombre del proyecto*',
    'Nombre(s) integrante 1*',
    'Apellido(s) integrante 1*',
    'Correo integrante 1*',
    'Código estudiantil integrante 1*',
    'Semestre integrante 1*',
    'Carrera integrante 1*',
    'Correo tutor 1',
  ]);
  ws.addRow([
    'Software',
    'Robot de riego',
    'Ana',
    'Pérez',
    'Ana@X.co',
    '2001',
    '3er Semestre',
    'Ingeniería Civil',
    'tutor@x.co',
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const upload = (originalname: string, buffer: Buffer) =>
  ({ originalname, buffer, size: buffer.length }) as Express.Multer.File;

// As the gateway project client delivers it: enums as strings, defaults filled
// and a virtual "_field" key for each optional field that is set
const createRow = {
  rowNumber: 3,
  outcome: 'PROJECT_IMPORT_CREATE',
  message: 'Se creará con 1 integrante.',
  projectName: 'Robot de riego',
  categoryName: 'Software',
  _categoryName: 'categoryName',
  state: 'APPROVED',
  participants: [{ email: 'ana@x.co', status: 'PROJECT_IMPORT_HAS_ACCOUNT' }],
  failedEffects: [],
};
const previewTotals = {
  rows: 1,
  toCreate: 1,
  skipped: 0,
  errors: 0,
  participants: 1,
  withoutAccount: 0,
};

describe('ProjectImportsService', () => {
  let previewProjectImport: jest.Mock;
  let executeProjectImport: jest.Mock;
  let getProjectImportTemplate: jest.Mock;
  let service: ProjectImportsService;

  const previewAnswer = (canConfirm: boolean, rows: object[] = [createRow]) =>
    of({ rows, totals: previewTotals, eventWarnings: [], canConfirm });

  beforeEach(() => {
    previewProjectImport = jest.fn(() => previewAnswer(true));
    executeProjectImport = jest.fn();
    getProjectImportTemplate = jest.fn();
    const client = {
      getService: () => ({
        previewProjectImport,
        executeProjectImport,
        getProjectImportTemplate,
      }),
    } as unknown as ClientGrpc;
    service = new ProjectImportsService(client);
    service.onModuleInit();
  });

  describe('preview', () => {
    it('sends the parsed rows and returns only the fields of the contract', async () => {
      const preview = await service.preview(
        7,
        upload('feria.xlsx', await filledTemplate()),
      );

      expect(previewProjectImport).toHaveBeenCalledWith({
        eventId: 7,
        rows: [
          expect.objectContaining({
            rowNumber: 3,
            name: 'Robot de riego',
            participants: [
              expect.objectContaining({
                semester: '3',
                career: 'ingenieria_civil',
              }),
            ],
            tutorEmails: ['tutor@x.co'],
          }),
        ],
      });
      expect(preview).toEqual({
        rows: [
          {
            rowNumber: 3,
            outcome: 'CREATE',
            message: 'Se creará con 1 integrante.',
            projectName: 'Robot de riego',
            categoryName: 'Software',
            state: 'APPROVED',
            participants: [{ email: 'ana@x.co', status: 'HAS_ACCOUNT' }],
          },
        ],
        totals: previewTotals,
        eventWarnings: [],
        canConfirm: true,
      });
    });

    it('refuses a missing file or one that is not .xlsx', async () => {
      await expect(service.preview(7, undefined)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.preview(7, upload('feria.csv', Buffer.from('a'))),
      ).rejects.toThrow('El archivo debe ser .xlsx.');
      expect(previewProjectImport).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('answers 400 with the preview and creates nothing when it cannot be confirmed', async () => {
      const errorRow = {
        ...createRow,
        outcome: 'PROJECT_IMPORT_ERROR',
        message: 'La categoría «Software» no existe en el evento.',
      };
      previewProjectImport.mockReturnValue(previewAnswer(false, [errorRow]));

      const error = await service
        .execute(7, upload('feria.xlsx', await filledTemplate()), 1)
        .catch((e: BadRequestException) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        message: string;
        details: {
          preview: { canConfirm: boolean; rows: { outcome: string }[] };
        };
      };
      expect(body.message).toContain('Revise la vista previa');
      expect(body.details.preview.canConfirm).toBe(false);
      expect(body.details.preview.rows.map((row) => row.outcome)).toEqual([
        'ERROR',
      ]);
      expect(executeProjectImport).not.toHaveBeenCalled();
    });

    it('creates with the file name and the acting user and maps the result', async () => {
      executeProjectImport.mockReturnValue(
        of({
          rows: [
            {
              ...createRow,
              outcome: 'PROJECT_IMPORT_CREATED',
              projectId: 41,
              _projectId: 'projectId',
              failedEffects: ['NOTIFICATION'],
            },
          ],
          totals: {
            rows: 1,
            created: 1,
            skipped: 0,
            errors: 0,
            emailsSent: 0,
            failedEffects: 1,
          },
        }),
      );

      const result = await service.execute(
        7,
        // Multer reads the UTF-8 name of the upload as latin1
        upload(
          Buffer.from('Inscripción.xlsx', 'utf8').toString('latin1'),
          await filledTemplate(),
        ),
        12,
      );

      expect(executeProjectImport).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 7,
          actingUserId: 12,
          fileName: 'Inscripción.xlsx',
        }),
      );
      expect(result).toEqual({
        rows: [
          expect.objectContaining({
            outcome: 'CREATED',
            projectId: 41,
            failedEffects: ['NOTIFICATION'],
          }),
        ],
        totals: {
          created: 1,
          skipped: 0,
          errors: 0,
          emailsSent: 0,
          failedEffects: 1,
        },
      });
    });
  });

  it('names the template after the event', async () => {
    getProjectImportTemplate.mockReturnValue(
      of({
        eventName: 'Feria de Proyectos 2026-2',
        categoryNames: ['Software'],
        requiresCourse: false,
      }),
    );

    const { fileName, file } = await service.template(7);

    expect(fileName).toBe('plantilla-proyectos-feria_de_proyectos_2026_2.xlsx');
    expect(file.length).toBeGreaterThan(0);
  });
});
