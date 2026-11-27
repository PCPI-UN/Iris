import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ProjectState } from '@app/common/generated/project';
import { PROJECT_IMPORT_MAX_ROWS } from './project-import-format';
import { parseProjectImportSheet } from './parse-project-import-sheet';

const FIXED_HEADERS = [
  'Categoría*',
  'NRC*',
  'Nombre del proyecto*',
  'Descripción',
  'Código',
  'Estado',
];

/** The six columns of student N, in the order of the template */
const participantHeaders = (n: number) => [
  `Nombre(s) integrante ${n}`,
  `Apellido(s) integrante ${n}`,
  `Correo integrante ${n}`,
  `Código estudiantil integrante ${n}`,
  `Semestre integrante ${n}`,
  `Carrera integrante ${n}`,
];

const allHeaders = (participants = 6, tutors = 2) => [
  ...FIXED_HEADERS,
  ...Array.from({ length: participants }, (_, i) =>
    participantHeaders(i + 1),
  ).flat(),
  ...Array.from({ length: tutors }, (_, i) => `Correo tutor ${i + 1}`),
];

/**
 * Builds an .xlsx like the template: title in row 1, legend in row 2, headers in row 4 and the
 * data from row 5. Each row is the list of cell values in header order.
 */
async function workbook(
  rows: ExcelJS.CellValue[][],
  opts: { sheet?: string; headers?: string[] } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheet ?? 'Proyectos');
  ws.addRow(['Proyectos · Feria de Proyectos 2026-2']);
  ws.addRow(['Azul: obligatorio. Gris: opcional.']);
  ws.addRow([]);
  ws.addRow(opts.headers ?? allHeaders());
  rows.forEach((values) => ws.addRow(values));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const EMPTY_STUDENT: ExcelJS.CellValue[] = ['', '', '', '', '', ''];

const STUDENT = [
  ' Ana ',
  'Pérez Ríos',
  ' ana.perez@uninorte.edu.co ',
  200012345,
  '3er Semestre',
  'Ingeniería Civil',
];

/** A project row: fixed cells, then the six student groups and the two tutors */
const project = (
  fixed: ExcelJS.CellValue[],
  students: ExcelJS.CellValue[][] = [],
  tutors: ExcelJS.CellValue[] = [],
): ExcelJS.CellValue[] => {
  const slots = Array.from(
    { length: 6 },
    (_, i) => students[i] ?? EMPTY_STUDENT,
  );
  return [...fixed, ...slots.flat(), tutors[0] ?? '', tutors[1] ?? ''];
};

const FIXED = [
  'Software',
  12345,
  'Edificio inteligente',
  'Una idea',
  'P-1',
  '',
];

const expectBadRequest = async (promise: Promise<unknown>, message: string) => {
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  await expect(promise).rejects.toThrow(message);
};

describe('parseProjectImportSheet', () => {
  it('reads the project with its students and tutors, with the headers in row 4', async () => {
    const file = await workbook([
      project(FIXED, [STUDENT], [' tutor@uninorte.edu.co ']),
    ]);
    expect(await parseProjectImportSheet(file)).toEqual([
      {
        rowNumber: 5,
        categoryName: 'Software',
        nrc: '12345',
        name: 'Edificio inteligente',
        description: 'Una idea',
        projectCode: 'P-1',
        state: ProjectState.APPROVED,
        participants: [
          {
            firstName: 'Ana',
            lastName: 'Pérez Ríos',
            email: 'ana.perez@uninorte.edu.co',
            studentCode: '200012345',
            semester: '3er Semestre',
            career: 'Ingeniería Civil',
          },
        ],
        tutorEmails: ['tutor@uninorte.edu.co'],
        formatErrors: [],
      },
    ]);
  });

  it('keeps only the filled students and tutors, in order of N', async () => {
    const second = [
      'Luis',
      'Mora',
      'luis@x.co',
      '2',
      '5to Semestre',
      'Derecho',
    ];
    const file = await workbook([
      project(FIXED, [STUDENT, EMPTY_STUDENT, second], ['', 'segundo@x.co']),
    ]);
    const [row] = await parseProjectImportSheet(file);
    expect(row.participants.map((p) => p.email)).toEqual([
      'ana.perez@uninorte.edu.co',
      'luis@x.co',
    ]);
    expect(row.tutorEmails).toEqual(['segundo@x.co']);
    expect(row.formatErrors).toEqual([]);
  });

  it('finds the columns in any order and ignores the ones it does not know', async () => {
    const headers = [
      'Notas',
      'Correo integrante 1',
      'Apellido(s) integrante 1',
      'Nombre del proyecto',
      'Nombre(s) integrante 1',
      'Categoría',
      'Código estudiantil integrante 1',
      'Carrera integrante 1',
      'Semestre integrante 1',
    ];
    const file = await workbook(
      [
        [
          'nada',
          'a@x.co',
          'Ríos',
          'Mi proyecto',
          'Ana',
          'Hardware',
          '1',
          'Derecho',
          '2do Semestre',
        ],
      ],
      { headers },
    );
    const [row] = await parseProjectImportSheet(file);
    expect(row).toMatchObject({
      categoryName: 'Hardware',
      name: 'Mi proyecto',
      nrc: '',
      description: '',
      projectCode: '',
      state: ProjectState.APPROVED,
      tutorEmails: [],
    });
    expect(row.participants).toEqual([
      {
        firstName: 'Ana',
        lastName: 'Ríos',
        email: 'a@x.co',
        studentCode: '1',
        semester: '2do Semestre',
        career: 'Derecho',
      },
    ]);
  });

  it('finds the headers when they are not in row 4, up to row 20', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Proyectos');
    for (let i = 0; i < 9; i++) ws.addRow(['relleno']);
    ws.addRow(allHeaders(1, 0));
    ws.addRow(['Software', '', 'P', '', '', '', ...STUDENT]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    const [row] = await parseProjectImportSheet(file);
    expect(row.rowNumber).toBe(11);
    expect(row.name).toBe('P');
  });

  it('ignores blank rows but keeps their row numbers', async () => {
    const file = await workbook([
      project(FIXED, [STUDENT]),
      allHeaders().map(() => ''),
      [],
      project(['Software', '', 'Otro', '', '', ''], [STUDENT]),
    ]);
    const rows = await parseProjectImportSheet(file);
    expect(rows.map((r) => [r.rowNumber, r.name])).toEqual([
      [5, 'Edificio inteligente'],
      [8, 'Otro'],
    ]);
  });

  describe('state', () => {
    const stateOf = async (value: ExcelJS.CellValue) => {
      const file = await workbook([
        project(['Software', '', 'P', '', '', value], [STUDENT]),
      ]);
      return (await parseProjectImportSheet(file))[0];
    };

    it('empty is APPROVED and "Aprobado" is APPROVED', async () => {
      expect((await stateOf('')).state).toBe(ProjectState.APPROVED);
      expect((await stateOf('Aprobado')).state).toBe(ProjectState.APPROVED);
    });

    it('"En revisión" is UNDER_REVIEW, with or without accent and case', async () => {
      expect((await stateOf('En revisión')).state).toBe(
        ProjectState.UNDER_REVIEW,
      );
      expect((await stateOf(' en revision ')).state).toBe(
        ProjectState.UNDER_REVIEW,
      );
    });

    it('any other value is a message of the row, not an error of the file', async () => {
      const row = await stateOf('Rechazado');
      expect(row.state).toBe(ProjectState.APPROVED);
      expect(row.formatErrors).toEqual([
        'Estado «Rechazado» no válido: use «Aprobado» o «En revisión».',
      ]);
    });
  });

  describe('half filled students', () => {
    it('reports the missing cells in the row and does not return the student', async () => {
      const half = ['Luis', '', 'luis@x.co', '', '5to Semestre', ''];
      const file = await workbook([
        project(FIXED, [STUDENT, half]),
        project(['Software', '', 'Otro', '', '', ''], [STUDENT]),
      ]);
      const rows = await parseProjectImportSheet(file);
      expect(rows[0].participants).toHaveLength(1);
      expect(rows[0].formatErrors).toEqual([
        'Integrante 2 incompleto: falta Apellido(s), Código estudiantil, Carrera.',
      ]);
      expect(rows[1].formatErrors).toEqual([]);
    });

    it('a row with only a half student is still a row, so it is reported', async () => {
      const file = await workbook([
        project(['', '', '', '', '', ''], [['Luis', '', '', '', '', '']]),
      ]);
      const [row] = await parseProjectImportSheet(file);
      expect(row.participants).toEqual([]);
      expect(row.formatErrors).toHaveLength(1);
    });
  });

  it('reads numbers, rich text and hyperlinks as text', async () => {
    const file = await workbook([
      project(
        [
          { richText: [{ text: 'Soft' }, { text: 'ware' }] },
          98765,
          'P',
          '',
          '',
          '',
        ],
        [STUDENT],
        [{ text: 't@x.co', hyperlink: 'mailto:t@x.co' }],
      ),
    ]);
    const [row] = await parseProjectImportSheet(file);
    expect(row.categoryName).toBe('Software');
    expect(row.nrc).toBe('98765');
    expect(row.tutorEmails).toEqual(['t@x.co']);
  });

  describe('errors of the file', () => {
    it('is not an .xlsx', async () => {
      await expectBadRequest(
        parseProjectImportSheet(Buffer.from('no es excel')),
        'no es un Excel',
      );
    });

    it('has no "Proyectos" sheet', async () => {
      const file = await workbook([project(FIXED, [STUDENT])], {
        sheet: 'Otra hoja',
      });
      await expectBadRequest(
        parseProjectImportSheet(file),
        'No se encontró la hoja «Proyectos»',
      );
    });

    it('accepts the sheet name with other case or accents', async () => {
      const file = await workbook([project(FIXED, [STUDENT])], {
        sheet: 'PROYECTOS',
      });
      await expect(parseProjectImportSheet(file)).resolves.toHaveLength(1);
    });

    it('has no headers in the first 20 rows', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Proyectos');
      for (let i = 0; i < 20; i++) ws.addRow(['relleno']);
      ws.addRow(allHeaders());
      ws.addRow(project(FIXED, [STUDENT]));
      await expectBadRequest(
        parseProjectImportSheet(Buffer.from(await wb.xlsx.writeBuffer())),
        'Faltan columnas en la hoja «Proyectos»: Categoría, Nombre del proyecto',
      );
    });

    it('has no student columns', async () => {
      const file = await workbook([['Software', '', 'P']], {
        headers: ['Categoría', 'Nombre del proyecto', 'NRC'],
      });
      await expectBadRequest(
        parseProjectImportSheet(file),
        'Faltan las columnas de integrantes',
      );
    });

    it('repeats a column', async () => {
      const file = await workbook([], {
        headers: [...allHeaders(), 'Correo integrante 1'],
      });
      await expectBadRequest(
        parseProjectImportSheet(file),
        'aparece más de una vez',
      );
    });

    it('has no projects', async () => {
      await expectBadRequest(
        parseProjectImportSheet(await workbook([])),
        'El archivo no tiene proyectos',
      );
    });

    it(`has more than ${PROJECT_IMPORT_MAX_ROWS} projects`, async () => {
      const rows = Array.from({ length: PROJECT_IMPORT_MAX_ROWS + 1 }, (_, i) =>
        project(['Software', '', `P${i}`, '', '', ''], [STUDENT]),
      );
      await expectBadRequest(
        parseProjectImportSheet(await workbook(rows)),
        `el máximo es ${PROJECT_IMPORT_MAX_ROWS}`,
      );
    });
  });
});
