import * as ExcelJS from 'exceljs';
import {
  buildJurorImportTemplate,
  JurorImportTemplateData,
} from './build-juror-import-template';
import { parseJurorImportSheet } from './parse-juror-import-sheet';

const CIVIL = 'Dpt. Ingeniería Civil y Ambiental';
const INDUSTRIAL = 'Dpt. Ingeniería Industrial';

const DATA: JurorImportTemplateData = {
  eventName: '202610 - Feria de Proyectos Finales',
  projects: [
    {
      projectId: 184,
      department: CIVIL,
      projectCode: '5',
      name: 'Edificio',
      members: ['Ana Pérez', 'Luis Mora'],
      tutors: ['Margarita Gamarra'],
    },
    {
      projectId: 200,
      department: CIVIL,
      projectCode: '',
      name: 'Sin número',
      members: [],
      tutors: [],
    },
    {
      projectId: 195,
      department: INDUSTRIAL,
      projectCode: 'A-3',
      name: 'Modelo',
      members: ['Sofía Díaz'],
      tutors: [],
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
  let ws: ExcelJS.Worksheet;

  beforeAll(async () => {
    wb = await load(await buildJurorImportTemplate(DATA));
    ws = wb.getWorksheet('Asignación jurados')!;
  });

  it('has a single sheet with the title, the legend and the headers in row 4', () => {
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Asignación jurados']);
    expect(ws.getCell('A1').value).toBe(
      'Asignación de jurados · 202610 - Feria de Proyectos Finales',
    );
    expect(ws.getCell('A2').text).toContain('Amarillo');
    expect(ws.getRow(4).values).toEqual([
      undefined,
      'Departamento',
      'Número',
      'Nombre del proyecto',
      'Tutor(es)',
      'Integrantes',
      'N° integrantes',
      ...[1, 2, 3, 4].flatMap((n) => [
        `Nombre(s) jurado ${n}`,
        `Apellido(s) jurado ${n}`,
        `Correo jurado ${n}`,
      ]),
      'Revisión (auto)',
      'Notas sobre los datos',
    ]);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
  });

  it('writes one gray row per project, keeping numbers as numbers and the missing one empty', () => {
    const rows = [5, 6, 7].map((r) =>
      [1, 2, 3, 4, 5, 6].map((c) => ws.getRow(r).getCell(c).value),
    );
    expect(rows).toEqual([
      [CIVIL, 5, 'Edificio', 'Margarita Gamarra', 'Ana Pérez\nLuis Mora', 2],
      [CIVIL, null, 'Sin número', null, null, 0],
      [INDUSTRIAL, 'A-3', 'Modelo', null, 'Sofía Díaz', 1],
    ]);
    expect(ws.getCell('A5').fill).toMatchObject({
      fgColor: { argb: 'FFF2F2F2' },
    });
    expect(ws.getCell('G5').fill).toMatchObject({
      fgColor: { argb: 'FFFFF2CC' },
    });
    expect(ws.getCell('T5').value).toBeNull();
  });

  it('computes Revisión per row, with the tutor key in the hidden column U', () => {
    expect(ws.getColumn('U').hidden).toBe(true);
    expect(ws.getCell('U5').formula).toContain('LOWER(D5)');
    const review = (r: number) => ws.getCell(`S${r}`).formula;
    expect(review(5)).toContain('"Sin jurados"');
    expect(review(5)).toContain('Jurado 4 parece ser tutor');
    expect(review(5)).not.toContain('Sin número');
    expect(review(6)).toContain('Sin número en IRIS');
    expect(ws.getCell('S8').value).toBeNull();
  });

  it('paints a juror that looks like the tutor and the Revisión messages', () => {
    const { conditionalFormattings } = ws as unknown as {
      conditionalFormattings: { ref: string }[];
    };
    const refs = conditionalFormattings.map((c) => c.ref);
    expect(refs).toEqual(['G5:H7', 'J5:K7', 'M5:N7', 'P5:Q7', 'S5:S7']);
  });

  it('is read back by the parser once filled, and has no example rows', async () => {
    await expect(
      parseJurorImportSheet(await buildJurorImportTemplate(DATA)),
    ).rejects.toThrow('El archivo no tiene jurados.');

    ws.getCell('G5').value = 'Ana';
    ws.getCell('H5').value = 'Pérez Ríos';
    ws.getCell('I5').value = 'ana.perez@uninorte.edu.co';
    ws.getCell('P7').value = 'Luis';
    ws.getCell('Q7').value = 'Mora';
    ws.getCell('R7').value = 'luis@x.co';
    const filled = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(parseJurorImportSheet(filled)).resolves.toEqual([
      {
        rowNumber: 5,
        department: CIVIL,
        projectCode: '5',
        jurorSlot: 1,
        firstName: 'Ana',
        lastName: 'Pérez Ríos',
        email: 'ana.perez@uninorte.edu.co',
      },
      {
        rowNumber: 7,
        department: INDUSTRIAL,
        projectCode: 'A-3',
        jurorSlot: 4,
        firstName: 'Luis',
        lastName: 'Mora',
        email: 'luis@x.co',
      },
    ]);
  });

  it('builds a valid empty sheet when the event has no approved projects', async () => {
    const empty = await load(
      await buildJurorImportTemplate({ ...DATA, projects: [] }),
    );
    expect(
      empty.getWorksheet('Asignación jurados')!.getCell('A5').value,
    ).toBeNull();
  });
});
