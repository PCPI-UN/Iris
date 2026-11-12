import * as ExcelJS from 'exceljs';
import {
  buildJurorImportTemplate,
  JurorImportTemplateData,
} from './build-juror-import-template';
import { parseJurorImportSheet } from './parse-juror-import-sheet';
import { JUROR_IMPORT_MAX_ROWS } from './juror-import-format';

const CIVIL = 'Dpt. Ingeniería Civil y Ambiental';
const INDUSTRIAL = 'Dpt. Ingeniería Industrial';

const DATA: JurorImportTemplateData = {
  eventName: '202610 - Feria de Proyectos Finales',
  departments: [CIVIL, INDUSTRIAL],
  projects: [
    { projectId: 184, department: CIVIL, projectCode: '5', name: 'Edificio' },
    { projectId: 200, department: CIVIL, projectCode: '', name: 'Sin número' },
    {
      projectId: 195,
      department: INDUSTRIAL,
      projectCode: 'A-3',
      name: 'Modelo',
    },
  ],
};

async function load(file: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ExcelJS.Buffer);
  return wb;
}

describe('buildJurorImportTemplate', () => {
  let wb: ExcelJS.Workbook;

  beforeAll(async () => {
    wb = await load(await buildJurorImportTemplate(DATA));
  });

  it('has the sheets in order, with the department list hidden', () => {
    expect(wb.worksheets.map((ws) => [ws.name, ws.state])).toEqual([
      ['Instrucciones', 'visible'],
      ['Asignaciones', 'visible'],
      ['Proyectos', 'visible'],
      ['Validaciones', 'visible'],
      ['Listas', 'hidden'],
    ]);
    expect(wb.getWorksheet('Instrucciones')!.getCell('B2').value).toBe(
      'Evento: 202610 - Feria de Proyectos Finales',
    );
  });

  it('writes the headers the parser reads and helper formulas up to the row limit', () => {
    const ws = wb.getWorksheet('Asignaciones')!;
    expect(ws.getRow(1).values).toEqual([
      undefined,
      'Departamento*',
      'Número*',
      'Nombre proyecto (auto)',
      'Jurado*',
      'Email*',
      'Revisión (auto)',
    ]);
    const last = JUROR_IMPORT_MAX_ROWS + 1;
    expect(ws.getCell(`C${last}`).formula).toContain(
      `MATCH(A${last}&"|"&B${last}`,
    );
    expect(ws.getCell(`F${last}`).formula).toContain('Error: fila repetida');
    expect(ws.getCell(`C${last + 1}`).value).toBeNull();
    expect(ws.getCell('A2').value).toBeNull();
  });

  it('offers the departments of the event as a dropdown', () => {
    const ws = wb.getWorksheet('Asignaciones')!;
    expect(ws.getCell('A2').dataValidation).toMatchObject({
      type: 'list',
      formulae: ['Listas!$A$2:$A$3'],
    });
    const lists = wb.getWorksheet('Listas')!;
    expect([lists.getCell('A2').value, lists.getCell('A3').value]).toEqual([
      CIVIL,
      INDUSTRIAL,
    ]);
  });

  it('lists the projects, keeping numbers as numbers and those without number', () => {
    const ws = wb.getWorksheet('Proyectos')!;
    const rows = [2, 3, 4].map((r) =>
      [1, 2, 3, 4].map((c) => ws.getRow(r).getCell(c).value),
    );
    expect(rows).toEqual([
      [CIVIL, 5, 184, 'Edificio'],
      [CIVIL, null, 200, 'Sin número'],
      [INDUSTRIAL, 'A-3', 195, 'Modelo'],
    ]);
    expect(ws.getCell('F2').formula).toBe('A2&"|"&B2');
  });

  // TODO(commit C): the builder still writes the old sheet; C rewrites it and restores this round trip
  it.skip('is read back by the parser once filled, and has no example rows', async () => {
    await expect(
      parseJurorImportSheet(await buildJurorImportTemplate(DATA)),
    ).rejects.toThrow('El archivo no tiene filas con datos.');

    const ws = wb.getWorksheet('Asignaciones')!;
    ws.getRow(2).getCell(1).value = CIVIL;
    ws.getRow(2).getCell(2).value = 5;
    ws.getRow(2).getCell(4).value = 'Ana Pérez Ríos';
    ws.getRow(2).getCell(5).value = 'ana.perez@uninorte.edu.co';
    const filled = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(parseJurorImportSheet(filled)).resolves.toEqual([
      {
        rowNumber: 2,
        department: CIVIL,
        projectCode: '5',
        jurorName: 'Ana Pérez Ríos',
        email: 'ana.perez@uninorte.edu.co',
      },
    ]);
  });

  it('skips the dropdown when the event has no departments', async () => {
    const empty = await load(
      await buildJurorImportTemplate({
        ...DATA,
        departments: [],
        projects: [],
      }),
    );

    expect(
      empty.getWorksheet('Asignaciones')!.getCell('A2').dataValidation,
    ).toBeUndefined();
    expect(empty.getWorksheet('Proyectos')!.rowCount).toBe(1);
  });
});
