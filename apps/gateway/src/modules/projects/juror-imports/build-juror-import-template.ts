import * as ExcelJS from 'exceljs';
import { JUROR_IMPORT_MAX_ROWS } from './juror-import-format';

// Legacy layout (one juror per row): the parser no longer reads it. Commit C rewrites this file.
const JUROR_IMPORT_SHEET = 'Asignaciones';
type JurorImportField = 'department' | 'projectCode' | 'jurorName' | 'email';
const JUROR_IMPORT_COLUMNS: { field: JurorImportField; label: string }[] = [
  { field: 'department', label: 'Departamento' },
  { field: 'projectCode', label: 'Número' },
  { field: 'jurorName', label: 'Jurado' },
  { field: 'email', label: 'Email' },
];

/** Data of the event, as GetJurorImportTemplate returns it */
export interface JurorImportTemplateData {
  eventName: string;
  departments: string[];
  projects: {
    projectId: number;
    department: string;
    projectCode: string;
    name: string;
  }[];
}

const PROJECTS_SHEET = 'Proyectos';
const LISTS_SHEET = 'Listas';
const LAST_ROW = JUROR_IMPORT_MAX_ROWS + 1;

const NAVY = 'FF1F3864';
const INPUT_FILL = 'FFFFF2CC';
const AUTO_FILL = 'FFE7E6E6';
const AUTO_FONT = 'FF404040';
const ERROR_FONT = 'FFC00000';
const GRID = 'FFBFBFBF';
const SUBTITLE_FONT = 'FF595959';

/** The original template uses Arial 10 everywhere, including the empty cells to fill */
const FONT: Partial<ExcelJS.Font> = { name: 'Arial', size: 10 };

const label = (field: JurorImportField) =>
  JUROR_IMPORT_COLUMNS.find((c) => c.field === field)!.label;

/** Assignment sheet layout: A Departamento, B Número, C (auto), D Jurado, E Email, F (auto) */
const ASSIGNMENT_COLUMNS: { header: string; width: number; input: boolean }[] =
  [
    { header: `${label('department')}*`, width: 38, input: true },
    { header: `${label('projectCode')}*`, width: 10, input: true },
    { header: 'Nombre proyecto (auto)', width: 55, input: false },
    { header: `${label('jurorName')}*`, width: 30, input: true },
    { header: `${label('email')}*`, width: 34, input: true },
    { header: 'Revisión (auto)', width: 36, input: false },
  ];

/** Project sheet layout: A Departamento, B Número, C Id, D Nombre, E N° jurados, F Llave */
const PROJECT_HEADERS = [
  'Departamento',
  'Número',
  'Id (interno IRIS)',
  'Nombre proyecto',
  'N° jurados en este archivo',
  'Llave (auto)',
];

const INSTRUCTIONS: { text: string; heading?: boolean; fill?: string }[] = [
  { text: 'Qué diligencia decanatura', heading: true },
  {
    text: `Solo la hoja '${JUROR_IMPORT_SHEET}': una fila por cada jurado de cada proyecto, con Departamento, Número del proyecto, nombre y correo del jurado. Un proyecto con 3 jurados ocupa 3 filas. Máximo ${JUROR_IMPORT_MAX_ROWS} filas.`,
  },
  { text: '' },
  { text: 'Qué hace IRIS al cargar el archivo', heading: true },
  {
    text: '1. Busca cada proyecto por Departamento + Número dentro de este evento (el Número solo se repite entre departamentos).',
  },
  {
    text: '2. Busca cada jurado por su correo. Si no tiene cuenta, IRIS la crea con el nombre de la fila.',
  },
  {
    text: '3. Muestra una vista previa con el resultado de cada fila. Nada se guarda ni se envía hasta confirmar, y no se puede confirmar si hay errores.',
  },
  {
    text: '4. Al confirmar, crea las asignaciones e invita a los jurados que aún no están en el evento.',
  },
  { text: '' },
  { text: 'Colores', heading: true },
  { text: 'Amarillo: lo que diligencia decanatura.', fill: INPUT_FILL },
  {
    text: 'Gris: lo genera IRIS o se calcula solo. No se edita.',
    fill: AUTO_FILL,
  },
  { text: '' },
  {
    text: `La hoja '${PROJECTS_SHEET}' trae los proyectos aprobados del evento al momento de descargar la plantilla. Un proyecto sin Número debe numerarse en IRIS antes de asignarle jurados.`,
  },
  {
    text: `Las columnas grises de '${JUROR_IMPORT_SHEET}' son una ayuda: la validación que cuenta es la de IRIS al cargar el archivo.`,
  },
  { text: '' },
  {
    text: `No cambie el nombre de la hoja '${JUROR_IMPORT_SHEET}' ni de sus encabezados.`,
  },
];

const RULES: [string, string][] = [
  [
    `Que exista la hoja '${JUROR_IMPORT_SHEET}' con las columnas Departamento, Número, Jurado y Email.`,
    `Faltan columnas en la hoja «${JUROR_IMPORT_SHEET}»: Número, Email.`,
  ],
  [
    'Que cada fila tenga Departamento, Número, Jurado y Email.',
    'Faltan los datos obligatorios: Número, Email.',
  ],
  ['Que el correo sea válido.', 'El correo «ana.perez@uninorte» no es válido.'],
  [
    'Que no haya filas repetidas (mismo departamento, número y correo).',
    'Fila repetida: igual a la fila 3.',
  ],
  [
    'Que el departamento sea una categoría del evento.',
    'El departamento «Dpt. Ing. Civil» no existe en este evento.',
  ],
  [
    'Que Departamento + Número correspondan a un solo proyecto aprobado del evento.',
    'No hay proyecto con número 99 en «Dpt. Ingeniería Industrial».',
  ],
  [
    'Que el jurado no esté en el evento con otro rol (por ejemplo, como participante).',
    'ana.perez@uninorte.edu.co ya está en este evento con otro rol; no puede ser jurado.',
  ],
  [
    'Que la asignación no exista ya; si existe, la fila se omite.',
    'Ya estaba asignado a este proyecto; se omite.',
  ],
  [
    'Que el evento esté activo y no haya terminado; si no, no se puede confirmar.',
    'El evento ya terminó (fecha de fin: 30/10/2026).',
  ],
];

const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: GRID } },
  left: { style: 'thin', color: { argb: GRID } },
  bottom: { style: 'thin', color: { argb: GRID } },
  right: { style: 'thin', color: { argb: GRID } },
};

const fill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

/** Column widths with Arial 10 as the style of every cell of the column, typed later or not */
const columns = (widths: number[]): Partial<ExcelJS.Column>[] =>
  widths.map((width) => ({ width, style: { font: FONT } }));

function styleHeader(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(NAVY);
    cell.border = border;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
  });
}

/** Numbers as numbers, so the key Departamento|Número matches what Excel reads in the sheet */
const codeCell = (code: string): string | number =>
  /^\d+$/.test(code) ? Number(code) : code;

function addInstructions(wb: ExcelJS.Workbook, eventName: string) {
  const ws = wb.addWorksheet('Instrucciones');
  ws.columns = columns([4, 110]);
  const text = (row: number, value: string, font: Partial<ExcelJS.Font>) => {
    const cell = ws.getCell(row, 2);
    cell.value = value;
    cell.font = font;
    cell.alignment = { wrapText: true, vertical: 'top' };
    return cell;
  };
  text(1, 'IRIS · Plantilla de asignación de jurados', {
    ...FONT,
    size: 14,
    bold: true,
    color: { argb: NAVY },
  });
  text(2, `Evento: ${eventName}`, {
    ...FONT,
    italic: true,
    color: { argb: SUBTITLE_FONT },
  });
  INSTRUCTIONS.forEach(({ text: value, heading, fill: legend }, i) => {
    const cell = text(
      i + 4,
      value,
      heading ? { ...FONT, size: 11, bold: true, color: { argb: NAVY } } : FONT,
    );
    if (legend) cell.fill = fill(legend);
  });
}

function addAssignments(wb: ExcelJS.Workbook, departmentCount: number) {
  const ws = wb.addWorksheet(JUROR_IMPORT_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = columns(ASSIGNMENT_COLUMNS.map(({ width }) => width));
  styleHeader(ws.addRow(ASSIGNMENT_COLUMNS.map(({ header }) => header)));

  const departmentList =
    departmentCount > 0
      ? `${LISTS_SHEET}!$A$2:$A$${departmentCount + 1}`
      : undefined;
  for (let r = 2; r <= LAST_ROW; r++) {
    const row = ws.getRow(r);
    ASSIGNMENT_COLUMNS.forEach(({ input }, i) => {
      const cell = row.getCell(i + 1);
      cell.fill = fill(input ? INPUT_FILL : AUTO_FILL);
      cell.border = border;
      cell.font = input ? FONT : { ...FONT, color: { argb: AUTO_FONT } };
    });
    row.getCell(3).value = {
      formula: `IF(OR(A${r}="",B${r}=""),"",IFERROR(INDEX(${PROJECTS_SHEET}!$D:$D,MATCH(A${r}&"|"&B${r},${PROJECTS_SHEET}!$F:$F,0)),"No existe en el evento"))`,
    };
    row.getCell(6).value = {
      formula:
        `IF(AND(A${r}="",B${r}="",D${r}="",E${r}=""),"",` +
        `IF(OR(A${r}="",B${r}="",D${r}="",E${r}=""),"Error: falta un dato obligatorio",` +
        `IF(ISNA(MATCH(A${r}&"|"&B${r},${PROJECTS_SHEET}!$F:$F,0)),"Error: proyecto no está en el evento",` +
        `IF(ISERROR(FIND("@",E${r})),"Error: correo no válido",` +
        `IF(COUNTIFS($A$2:$A$${LAST_ROW},A${r},$B$2:$B$${LAST_ROW},B${r},$E$2:$E$${LAST_ROW},E${r})>1,"Error: fila repetida","OK")))))`,
    };
    if (departmentList) {
      row.getCell(1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [departmentList],
        showErrorMessage: false,
      };
    }
    row.getCell(2).dataValidation = {
      type: 'whole',
      operator: 'greaterThan',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: false,
    };
  }
  ws.addConditionalFormatting({
    ref: `F2:F${LAST_ROW}`,
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: ['LEFT(F2,5)="Error"'],
        style: { font: { bold: true, color: { argb: ERROR_FONT } } },
      },
    ],
  });
}

function addProjects(
  wb: ExcelJS.Workbook,
  projects: JurorImportTemplateData['projects'],
) {
  const ws = wb.addWorksheet(PROJECTS_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = columns([38, 10, 12, 70, 14, 40]);
  styleHeader(ws.addRow(PROJECT_HEADERS));
  projects.forEach((project, i) => {
    const r = i + 2;
    const row = ws.addRow([
      project.department,
      project.projectCode ? codeCell(project.projectCode) : null,
      project.projectId,
      project.name,
      {
        formula: `COUNTIFS(${JUROR_IMPORT_SHEET}!$A:$A,A${r},${JUROR_IMPORT_SHEET}!$B:$B,B${r})`,
      },
      { formula: `A${r}&"|"&B${r}` },
    ]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = FONT;
      cell.fill = fill(AUTO_FILL);
      cell.border = border;
      cell.alignment =
        col === 5
          ? { horizontal: 'center', vertical: 'top' }
          : { vertical: 'top', wrapText: true };
    });
  });
}

function addRules(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Validaciones');
  ws.columns = columns([5, 70, 70]);
  styleHeader(
    ws.addRow(['#', 'Qué valida IRIS al cargar', 'Ejemplo de mensaje']),
  );
  RULES.forEach(([rule, example], i) => {
    ws.addRow([i + 1, rule, example]).eachCell((cell) => {
      cell.font = FONT;
      cell.alignment = { wrapText: true, vertical: 'top' };
      cell.border = border;
    });
  });
}

function addLists(wb: ExcelJS.Workbook, departments: string[]) {
  const ws = wb.addWorksheet(LISTS_SHEET, { state: 'hidden' });
  ws.columns = columns([40]);
  ws.addRow(['Departamento']);
  departments.forEach((department) => ws.addRow([department]));
}

/**
 * Builds the juror template of an event: instructions, an empty assignment sheet with
 * the helper formulas, the approved projects and the rules IRIS checks on upload.
 */
export async function buildJurorImportTemplate(
  data: JurorImportTemplateData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IRIS';
  // The helper formulas are written without results: Excel computes them on open
  wb.calcProperties.fullCalcOnLoad = true;

  addInstructions(wb, data.eventName);
  addAssignments(wb, data.departments.length);
  addProjects(wb, data.projects);
  addRules(wb);
  addLists(wb, data.departments);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
