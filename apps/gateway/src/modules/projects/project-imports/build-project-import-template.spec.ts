import * as ExcelJS from 'exceljs';
import {
  buildProjectImportTemplate,
  ProjectImportTemplateData,
} from './build-project-import-template';
import { parseProjectImportSheet } from './parse-project-import-sheet';
import {
  PROJECT_IMPORT_CAREERS,
  PROJECT_IMPORT_SEMESTERS,
} from './project-import-format';

const DATA: ProjectImportTemplateData = {
  eventName: 'Feria de Proyectos 2026-2',
  categoryNames: ['Software', 'Hardware', 'Diseño'],
  requiresCourse: true,
};

async function load(file: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
  return wb;
}

/** Headers of row 6, by column letter */
const headersOf = (ws: ExcelJS.Worksheet) => {
  const result = new Map<string, string>();
  ws.getRow(6).eachCell((cell, n) => {
    result.set(ws.getColumn(n).letter, cell.text);
  });
  return result;
};

/** Formula of the dropdown at the first data row of a column */
const dropdownOf = (ws: ExcelJS.Worksheet, address: string) =>
  ws.getCell(address).dataValidation as ExcelJS.DataValidation | undefined;

describe('buildProjectImportTemplate', () => {
  let file: Buffer;
  let wb: ExcelJS.Workbook;
  let ws: ExcelJS.Worksheet;

  beforeAll(async () => {
    file = await buildProjectImportTemplate(DATA);
    wb = await load(file);
    ws = wb.getWorksheet('Proyectos')!;
  });

  it('has the Proyectos sheet, the hidden Listas sheet and the Instrucciones sheet', () => {
    expect(wb.worksheets.map((s) => [s.name, s.state])).toEqual([
      ['Proyectos', 'visible'],
      ['Listas', 'hidden'],
      ['Instrucciones', 'visible'],
    ]);
  });

  it('has the title with the event name, the legend and the headers in row 6', () => {
    expect(ws.getCell('A1').value).toBe(
      'Proyectos · Feria de Proyectos 2026-2',
    );
    expect(ws.getCell('A2').value).toBe('Colores');
    expect(ws.getCell('A3').text).toContain('obligatoria');
    expect(ws.getCell('A4').text).toContain('opcional');
    const headers = [...headersOf(ws).values()];
    expect(headers.slice(0, 6)).toEqual([
      'Categoría*',
      'NRC*',
      'Nombre del proyecto*',
      'Descripción',
      'Código',
      'Estado',
    ]);
    // 6 fixed + 6 students x 6 columns + 2 tutors
    expect(headers).toHaveLength(6 + 36 + 2);
    expect(headers.slice(6, 12)).toEqual([
      'Nombre(s) integrante 1*',
      'Apellido(s) integrante 1*',
      'Correo integrante 1*',
      'Código estudiantil integrante 1*',
      'Semestre integrante 1*',
      'Carrera integrante 1*',
    ]);
    expect(headers[12]).toBe('Nombre(s) integrante 2');
    expect(headers.slice(-2)).toEqual(['Correo tutor 1', 'Correo tutor 2']);
  });

  it('marks NRC as required only when the event requires the course', async () => {
    const without = await load(
      await buildProjectImportTemplate({ ...DATA, requiresCourse: false }),
    );
    expect(headersOf(without.getWorksheet('Proyectos')!).get('B')).toBe('NRC');
    expect(headersOf(ws).get('B')).toBe('NRC*');
  });

  it('writes the lists in the hidden sheet', () => {
    const lists = wb.getWorksheet('Listas')!;
    expect(lists.getColumn(1).values).toEqual([
      undefined,
      'categories',
      'Software',
      'Hardware',
      'Diseño',
    ]);
    expect(lists.getColumn(2).values).toEqual([
      undefined,
      'states',
      'Aprobado',
      'En revisión',
    ]);
    expect(lists.getColumn(3).values).toHaveLength(
      PROJECT_IMPORT_SEMESTERS.length + 2,
    );
    expect(lists.getColumn(4).values).toHaveLength(
      PROJECT_IMPORT_CAREERS.length + 2,
    );
  });

  it('points the dropdowns of category, state, semester and career to the Listas sheet', () => {
    expect(dropdownOf(ws, 'A7')?.formulae).toEqual(['Listas!$A$2:$A$4']);
    expect(dropdownOf(ws, 'F7')?.formulae).toEqual(['Listas!$B$2:$B$3']);
    // Student 1: semester is column J (10), career K (11); student 6 is the last pair
    const headers = headersOf(ws);
    const semester = [...headers].filter(([, h]) =>
      h.startsWith('Semestre integrante'),
    );
    const career = [...headers].filter(([, h]) =>
      h.startsWith('Carrera integrante'),
    );
    expect(semester).toHaveLength(6);
    expect(career).toHaveLength(6);
    for (const [letter] of semester) {
      expect(dropdownOf(ws, `${letter}7`)?.formulae).toEqual([
        `Listas!$C$2:$C$${PROJECT_IMPORT_SEMESTERS.length + 1}`,
      ]);
    }
    for (const [letter] of career) {
      expect(dropdownOf(ws, `${letter}506`)?.formulae).toEqual([
        `Listas!$D$2:$D$${PROJECT_IMPORT_CAREERS.length + 1}`,
      ]);
    }
  });

  it('has no dropdown in the free columns nor outside the 500 rows', () => {
    expect(dropdownOf(ws, 'C7')).toBeUndefined();
    expect(dropdownOf(ws, 'A507')).toBeUndefined();
    expect(dropdownOf(ws, 'A6')).toBeUndefined();
  });

  it('keeps a valid range when the event has no categories', async () => {
    const empty = await load(
      await buildProjectImportTemplate({ ...DATA, categoryNames: [] }),
    );
    expect(
      dropdownOf(empty.getWorksheet('Proyectos')!, 'A7')?.formulae,
    ).toEqual(['Listas!$A$2:$A$2']);
  });

  it('has instructions that mention the event rules', () => {
    const guide = wb.getWorksheet('Instrucciones')!;
    const text = Array.from(
      { length: guide.rowCount },
      (_, i) => guide.getCell(i + 1, 1).text,
    ).join('\n');
    expect(text).toContain('Feria de Proyectos 2026-2');
    expect(text).toContain('Este evento exige NRC');
  });

  it('is read back by the parser: headers recognized, no rows', async () => {
    await expect(parseProjectImportSheet(file)).rejects.toThrow(
      'El archivo no tiene proyectos.',
    );
  });

  it('is read back by the parser once a row is filled in', async () => {
    const filled = await load(file);
    const sheet = filled.getWorksheet('Proyectos')!;
    sheet.getRow(7).values = [
      'Software',
      '12345',
      'Mi proyecto',
      '',
      '',
      'En revisión',
      'Ana',
      'Pérez',
      'ana@x.co',
      '200',
      '3er Semestre',
      'Derecho',
    ];
    const rows = await parseProjectImportSheet(
      Buffer.from(await filled.xlsx.writeBuffer()),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 7,
      categoryName: 'Software',
      nrc: '12345',
      name: 'Mi proyecto',
      formatErrors: [],
    });
    expect(rows[0].participants[0].career).toBe('derecho');
  });
});
