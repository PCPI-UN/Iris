import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  JUROR_IMPORT_MAX_ROWS,
  parseJurorImportSheet,
} from './parse-juror-import-sheet';

const TEMPLATE_HEADERS = [
  'Departamento*',
  'Número*',
  'Nombre proyecto (auto)',
  'Jurado*',
  'Email*',
  'Revisión (auto)',
];

const CIVIL = 'Dpt. Ingeniería Civil y Ambiental';

/** Builds an .xlsx in memory; each row is a list of cell values in header order */
async function workbook(
  rows: ExcelJS.CellValue[][],
  opts: { sheet?: string; headers?: string[]; formulaRowsUntil?: number } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheet ?? 'Asignaciones');
  ws.addRow(opts.headers ?? TEMPLATE_HEADERS);
  rows.forEach((values) => ws.addRow(values));
  // The template ships "(auto)" formulas down to row 600, with nothing else in the row
  for (let r = rows.length + 2; r <= (opts.formulaRowsUntil ?? 0); r++) {
    ws.getCell(r, 3).value = { formula: `IF(A${r}="","",A${r})`, result: '' };
    ws.getCell(r, 6).value = { formula: `IF(A${r}="","","OK")`, result: '' };
  }
  wb.addWorksheet('Instrucciones').addRow(['Llene la hoja Asignaciones']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const expectBadRequest = async (promise: Promise<unknown>, message: string) => {
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  await expect(promise).rejects.toThrow(message);
};

describe('parseJurorImportSheet', () => {
  it('reads the template rows by header and ignores the (auto) columns', async () => {
    const file = await workbook(
      [
        [
          CIVIL,
          5,
          { formula: 'X', result: 'Edificio' },
          'Ana Pérez Ríos',
          'ana.perez@uninorte.edu.co',
          { formula: 'Y', result: 'OK' },
        ],
        [CIVIL, 6, '', '  Jorge Gómez Lara ', ' jgomez@estructurascaribe.co '],
      ],
      { formulaRowsUntil: 600 },
    );

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      {
        rowNumber: 2,
        department: CIVIL,
        projectCode: '5',
        jurorName: 'Ana Pérez Ríos',
        email: 'ana.perez@uninorte.edu.co',
      },
      {
        rowNumber: 3,
        department: CIVIL,
        projectCode: '6',
        jurorName: 'Jorge Gómez Lara',
        email: 'jgomez@estructurascaribe.co',
      },
    ]);
  });

  it('finds the columns in any order and without asterisks or accents', async () => {
    const file = await workbook(
      [['ANA@X.CO', 'Ana', '14', 'Dpt. Ingeniería Industrial']],
      {
        headers: ['email', 'JURADO', 'Numero', ' departamento '],
      },
    );

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      {
        rowNumber: 2,
        department: 'Dpt. Ingeniería Industrial',
        projectCode: '14',
        jurorName: 'Ana',
        email: 'ANA@X.CO',
      },
    ]);
  });

  it('reads hyperlinks, rich text and formula results as text', async () => {
    const file = await workbook([
      [
        { richText: [{ text: 'Dpt. Ingeniería ' }, { text: 'Industrial' }] },
        { formula: '7*2', result: 14 },
        '',
        'Laura',
        {
          text: 'lrodriguez@consultoravial.com',
          hyperlink: 'mailto:lrodriguez@consultoravial.com',
        },
      ],
    ]);

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      {
        rowNumber: 2,
        department: 'Dpt. Ingeniería Industrial',
        projectCode: '14',
        jurorName: 'Laura',
        email: 'lrodriguez@consultoravial.com',
      },
    ]);
  });

  it('keeps incomplete rows so project-service reports them', async () => {
    const file = await workbook([
      [CIVIL, '', '', 'Ana', ''],
      ['', '', '', '', ''],
      ['', 7, '', '', ''],
    ]);

    await expect(parseJurorImportSheet(file)).resolves.toEqual([
      {
        rowNumber: 2,
        department: CIVIL,
        projectCode: '',
        jurorName: 'Ana',
        email: '',
      },
      {
        rowNumber: 4,
        department: '',
        projectCode: '7',
        jurorName: '',
        email: '',
      },
    ]);
  });

  it('accepts the row limit and rejects one more', async () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => [
        CIVIL,
        i + 1,
        '',
        'Ana',
        `ana${i}@x.co`,
      ]);

    await expect(
      parseJurorImportSheet(await workbook(rows(JUROR_IMPORT_MAX_ROWS))),
    ).resolves.toHaveLength(JUROR_IMPORT_MAX_ROWS);
    await expectBadRequest(
      parseJurorImportSheet(await workbook(rows(JUROR_IMPORT_MAX_ROWS + 1))),
      `El archivo tiene ${JUROR_IMPORT_MAX_ROWS + 1} filas con datos; el máximo es ${JUROR_IMPORT_MAX_ROWS}.`,
    );
  });

  it('rejects a file without data rows', async () => {
    await expectBadRequest(
      parseJurorImportSheet(await workbook([], { formulaRowsUntil: 600 })),
      'El archivo no tiene filas con datos.',
    );
  });

  it('rejects a file without the Asignaciones sheet', async () => {
    await expectBadRequest(
      parseJurorImportSheet(
        await workbook([[CIVIL, 5, '', 'Ana', 'a@x.co']], { sheet: 'Hoja1' }),
      ),
      'No se encontró la hoja «Asignaciones».',
    );
  });

  it('lists the missing columns', async () => {
    await expectBadRequest(
      parseJurorImportSheet(
        await workbook([[CIVIL, 'Ana']], {
          headers: ['Departamento*', 'Jurado*'],
        }),
      ),
      'Faltan columnas en la hoja «Asignaciones»: Número, Email.',
    );
  });

  it('rejects a repeated column', async () => {
    await expectBadRequest(
      parseJurorImportSheet(
        await workbook([], {
          headers: ['Departamento*', 'Número*', 'Jurado*', 'Email*', 'Email'],
        }),
      ),
      'La columna «Email» aparece más de una vez.',
    );
  });

  it('rejects a file that is not an xlsx', async () => {
    await expectBadRequest(
      parseJurorImportSheet(Buffer.from('Departamento,Número\nCivil,5')),
      'El archivo no es un Excel .xlsx válido.',
    );
  });
});
