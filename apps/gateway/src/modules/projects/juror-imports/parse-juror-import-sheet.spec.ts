import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { JUROR_IMPORT_MAX_ROWS } from './juror-import-format';
import { parseJurorImportSheet } from './parse-juror-import-sheet';

const FIXED_HEADERS = [
  'Departamento',
  'Número',
  'Nombre del proyecto',
  'Tutor(es)',
  'Integrantes',
  'N° integrantes',
];

/** "Nombre(s) jurado 1", "Apellido(s) jurado 1", "Correo jurado 1", "Nombre(s) jurado 2"... */
const slotHeaders = (slots: number) =>
  Array.from({ length: slots }, (_, i) => [
    `Nombre(s) jurado ${i + 1}`,
    `Apellido(s) jurado ${i + 1}`,
    `Correo jurado ${i + 1}`,
  ]).flat();

const TRAILING_HEADERS = ['Revisión (auto)', 'Notas sobre los datos'];

const SISTEMAS = 'Dpt. Ingeniería de Sistemas y Computación';
const CIVIL = 'Dpt. Ingeniería Civil y Ambiental';

/**
 * Builds an .xlsx like the template: title in row 1, legend in row 2, headers in row 4 and the
 * data from row 5. Each row is the list of cell values in header order.
 */
async function workbook(
  rows: ExcelJS.CellValue[][],
  opts: { sheet?: string; headers?: string[]; slots?: number } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheet ?? 'Asignación jurados');
  ws.addRow(['Asignación de jurados · Feria 202630']);
  ws.addRow(['Gris: datos de IRIS. Amarillo: decanatura.']);
  ws.addRow([]);
  ws.addRow(
    opts.headers ?? [
      ...FIXED_HEADERS,
      ...slotHeaders(opts.slots ?? 4),
      ...TRAILING_HEADERS,
    ],
  );
  rows.forEach((values) => ws.addRow(values));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A project row: the grey data, then the juror cells starting at slot 1 */
const project = (
  department: string,
  code: ExcelJS.CellValue,
  jurors: ExcelJS.CellValue[],
): ExcelJS.CellValue[] => [
  department,
  code,
  'Edificio',
  'Daniel Romero',
  'Ana Ruiz\nLuis Mora',
  2,
  ...jurors,
];

const expectBadRequest = async (promise: Promise<unknown>, message: string) => {
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  await expect(promise).rejects.toThrow(message);
};

describe('parseJurorImportSheet', () => {
  it('reads one entry per filled juror group, with the headers in row 4', async () => {
    const file = await workbook([
      project(SISTEMAS, 3, [
        '  Ana ',
        'Pérez Ríos',
        ' ana.perez@uninorte.edu.co ',
        '',
        '',
        '',
        'Jorge',
        'Gómez',
        'jgomez@estructurascaribe.co',
      ]),
    ]);

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      {
        rowNumber: 5,
        department: SISTEMAS,
        projectCode: '3',
        jurorSlot: 1,
        firstName: 'Ana',
        lastName: 'Pérez Ríos',
        email: 'ana.perez@uninorte.edu.co',
      },
      {
        rowNumber: 5,
        department: SISTEMAS,
        projectCode: '3',
        jurorSlot: 3,
        firstName: 'Jorge',
        lastName: 'Gómez',
        email: 'jgomez@estructurascaribe.co',
      },
    ]);
  });

  it('finds the headers wherever they are in the first rows, and in any column order', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Asignación jurados');
    ws.addRow(['Título']);
    ws.addRow(['Leyenda']);
    ws.addRow([]);
    ws.addRow([]);
    ws.addRow([]);
    ws.addRow([
      'CORREO JURADO 1',
      'Número*',
      'apellido(s) jurado 1',
      'Departamento',
      'Nombre(s) jurado 1',
    ]);
    ws.addRow(['ana@x.co', 8, 'Ruiz', CIVIL, 'Ana']);
    const file = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      {
        rowNumber: 7,
        department: CIVIL,
        projectCode: '8',
        jurorSlot: 1,
        firstName: 'Ana',
        lastName: 'Ruiz',
        email: 'ana@x.co',
      },
    ]);
  });

  it('keeps an incomplete group so project-service reports it', async () => {
    const file = await workbook([
      project(CIVIL, 2, ['Ana', '', '', '', '', 'ana@x.co']),
    ]);

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      expect.objectContaining({
        jurorSlot: 1,
        firstName: 'Ana',
        lastName: '',
        email: '',
      }),
      expect.objectContaining({
        jurorSlot: 2,
        firstName: '',
        lastName: '',
        email: 'ana@x.co',
      }),
    ]);
  });

  it('reads a numeric project number and the juror cells as text', async () => {
    const file = await workbook([
      project(CIVIL, 12, [
        { richText: [{ text: 'An' }, { text: 'a' }] },
        'Ruiz',
        { text: 'ana@x.co', hyperlink: 'mailto:ana@x.co' },
      ]),
      project(CIVIL, 'A-3', [
        'Eva',
        'Soto',
        { formula: 'X', result: 'eva@x.co' },
      ]),
    ]);

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      expect.objectContaining({
        projectCode: '12',
        firstName: 'Ana',
        email: 'ana@x.co',
      }),
      expect.objectContaining({ projectCode: 'A-3', email: 'eva@x.co' }),
    ]);
  });

  it('ignores the rows with only the grey data and the (auto) columns', async () => {
    const file = await workbook([
      [
        ...project(SISTEMAS, 1, []),
        ...Array<string>(12).fill(''),
        'Sin jurados',
        'una nota',
      ],
      project(SISTEMAS, 2, ['Ana', 'Ruiz', 'ana@x.co']),
    ]);

    const rows = await parseJurorImportSheet(file);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rowNumber: 6, projectCode: '2' });
  });

  it('accepts more than four jurors per project and orders them by N', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Asignación jurados');
    ws.addRow([
      'Departamento',
      'Número',
      'Correo jurado 6',
      'Nombre(s) jurado 6',
      'Correo jurado 5',
      'Nombre(s) jurado 5',
    ]);
    ws.addRow([CIVIL, 1, 'f@x.co', 'F', 'e@x.co', 'E']);
    const file = Buffer.from(await wb.xlsx.writeBuffer());

    const rows = await parseJurorImportSheet(file);

    expect(rows.map((r) => [r.jurorSlot, r.firstName, r.email])).toEqual([
      [5, 'E', 'e@x.co'],
      [6, 'F', 'f@x.co'],
    ]);
  });

  it('accepts the juror limit and rejects one more', async () => {
    const jurorRow = (n: number) =>
      project(CIVIL, n, [`J${n}`, 'X', `j${n}@x.co`]);
    const atLimit = await workbook(
      Array.from({ length: JUROR_IMPORT_MAX_ROWS }, (_, i) => jurorRow(i + 1)),
    );
    await expect(parseJurorImportSheet(atLimit)).resolves.toHaveLength(
      JUROR_IMPORT_MAX_ROWS,
    );

    const overLimit = await workbook(
      Array.from({ length: JUROR_IMPORT_MAX_ROWS + 1 }, (_, i) =>
        jurorRow(i + 1),
      ),
    );
    await expectBadRequest(
      parseJurorImportSheet(overLimit),
      `el máximo es ${JUROR_IMPORT_MAX_ROWS}`,
    );
  });

  it('rejects a file without jurors', async () => {
    await expectBadRequest(
      parseJurorImportSheet(await workbook([project(CIVIL, 1, [])])),
      'El archivo no tiene jurados.',
    );
  });

  it('rejects a file without the Asignación jurados sheet', async () => {
    await expectBadRequest(
      parseJurorImportSheet(await workbook([], { sheet: 'Otra hoja' })),
      'No se encontró la hoja «Asignación jurados».',
    );
  });

  it('lists the fixed columns when the headers are missing', async () => {
    await expectBadRequest(
      parseJurorImportSheet(
        await workbook([], { headers: ['Departamento', ...slotHeaders(1)] }),
      ),
      'Faltan columnas en la hoja «Asignación jurados»: Departamento, Número.',
    );
  });

  it('rejects a sheet without juror columns', async () => {
    await expectBadRequest(
      parseJurorImportSheet(
        await workbook([], { headers: ['Departamento', 'Número'] }),
      ),
      'Faltan las columnas de jurados',
    );
  });

  it('rejects a repeated juror column', async () => {
    await expectBadRequest(
      parseJurorImportSheet(
        await workbook([], {
          headers: [
            'Departamento',
            'Número',
            'Correo jurado 1',
            'Correo jurado 1',
          ],
        }),
      ),
      'La columna «Correo jurado 1» aparece más de una vez.',
    );
  });

  it('rejects a file that is not an xlsx', async () => {
    await expectBadRequest(
      parseJurorImportSheet(Buffer.from('no soy un excel')),
      'El archivo no es un Excel .xlsx válido.',
    );
  });
});
