import * as ExcelJS from 'exceljs';
import { JUROR_IMPORT_SHEET } from './juror-import-format';

/** Data of the event, as GetJurorImportTemplate returns it */
export interface JurorImportTemplateData {
  eventName: string;
  projects: {
    projectId: number;
    department: string;
    projectCode: string;
    name: string;
    /** Full names of the participants, confirmed first and then pending */
    members: string[];
    /** Names of the tutors; empty until the tutor is stored in IRIS */
    tutors: string[];
  }[];
}

/** Jurors per project row, as in the template of decanatura */
const JUROR_SLOTS = 4;
/** First row with data: title, legend, a blank row and the headers come first */
const HEADER_ROW = 4;
const FIRST_ROW = HEADER_ROW + 1;

const NAVY = 'FF1F3864';
const OLIVE = 'FF7F6000';
const INPUT_FILL = 'FFFFF2CC';
const AUTO_FILL = 'FFF2F2F2';
const GRID = 'FFBFBFBF';
const SUBTITLE_FONT = 'FF595959';
const MUTED_FONT = 'FF808080';
const TUTOR_FILL = 'FFF8CBAD';
const TUTOR_FONT = 'FF9C0006';
/** Notas sobre los datos: free text of decanatura that IRIS does not read */
const NOTES_HEADER = 'FF375623';
const NOTES_FILL = 'FFE2EFDA';

/** The template of decanatura uses Arial 10 everywhere */
const FONT: Partial<ExcelJS.Font> = { name: 'Arial', size: 10 };

const LEGEND =
  'Gris: datos del proyecto (no editar). Amarillo: decanatura escribe nombre(s), apellido(s) y correo de cada jurado. Verde: notas libres, IRIS no las lee. La columna Revisión avisa si un jurado parece ser tutor del proyecto. Departamento y Número coinciden con IRIS.';

const LAST_COLUMN = 6 + JUROR_SLOTS * 3 + 2; // F + jurors + Revisión + Notas
const col = (n: number) => String.fromCharCode(64 + n);
const REVIEW_COL = col(6 + JUROR_SLOTS * 3 + 1);
const NOTES_COL = col(LAST_COLUMN);
/** Hidden column: the tutor without accents and in lowercase, to compare against the jurors */
const TUTOR_KEY_COL = col(LAST_COLUMN + 1);

const FIXED_COLUMNS: { header: string; width: number }[] = [
  { header: 'Departamento', width: 30 },
  { header: 'Número', width: 9 },
  { header: 'Nombre del proyecto', width: 50 },
  { header: 'Tutor(es)', width: 30 },
  { header: 'Integrantes', width: 45 },
  { header: 'N° integrantes', width: 11 },
];
const SLOT_COLUMNS: { header: string; width: number }[] = [
  { header: 'Nombre(s) jurado', width: 18 },
  { header: 'Apellido(s) jurado', width: 20 },
  { header: 'Correo jurado', width: 30 },
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

/** Text without accents and in lowercase, the same way the hidden column does it */
const normalize = (expr: string) =>
  ['á', 'é', 'í', 'ó', 'ú'].reduce(
    (acc, accent, i) => `SUBSTITUTE(${acc},"${accent}","${'aeiou'[i]}")`,
    `LOWER(${expr})`,
  );

/** One word of a cell: `start` 1 is the first, 101 the second */
const word = (cell: string, start: number) =>
  `TRIM(MID(SUBSTITUTE(TRIM(${cell})," ",REPT(" ",100)),${start},100))`;

/** The word has more than 2 letters and appears in the tutor key of the row */
const wordInTutor = (cell: string, start: number, r: string) =>
  `AND(LEN(${word(cell, start)})>2,ISNUMBER(SEARCH(${normalize(word(cell, start))},$${TUTOR_KEY_COL}${r})))`;

/**
 * "Parece ser tutor": the first word of the first name and the first or second word of the
 * last name appear in the tutor. `r` is the row ("5") or its relative form in a rule.
 */
const looksLikeTutor = (first: string, last: string, r: string) =>
  `AND(${first}<>"",${last}<>"",$${TUTOR_KEY_COL}${r}<>"",${wordInTutor(first, 1, r)},OR(${wordInTutor(last, 1, r)},${wordInTutor(last, 101, r)}))`;

/** Letters of the name, last name and email columns of juror `slot` (1-based) */
const slotColumns = (slot: number) => {
  const first = 6 + (slot - 1) * 3 + 1;
  return [col(first), col(first + 1), col(first + 2)];
};

function reviewFormula(r: number, withoutCode: boolean): string {
  const slots = Array.from({ length: JUROR_SLOTS }, (_, i) => i + 1);
  const empty = slots.map((s) => `(${slotColumns(s)[0]}${r}<>"")`).join('+');
  const tutors = slots
    .map((s) => {
      const [first, last] = slotColumns(s);
      return `IF(${looksLikeTutor(`${first}${r}`, `${last}${r}`, String(r))},"Jurado ${s} parece ser tutor. ","")`;
    })
    .join('&');
  const base = `IF((${empty})=0,"Sin jurados",TRIM(${tutors}))`;
  return withoutCode ? `TRIM("Sin número en IRIS. "&${base})` : base;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell((cell, n) => {
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(
      n > 6 && n <= 6 + JUROR_SLOTS * 3
        ? OLIVE
        : n === LAST_COLUMN
          ? NOTES_HEADER
          : NAVY,
    );
    cell.border = border;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
  });
}

/** Numbers as numbers, so the cell reads the same as the one decanatura types */
const codeCell = (code: string): string | number | null =>
  !code ? null : /^\d+$/.test(code) ? Number(code) : code;

/**
 * Builds the juror template of an event: one sheet with a row per approved project, its data
 * in gray and a group of yellow cells per juror, with the helper columns of decanatura.
 */
export async function buildJurorImportTemplate(
  data: JurorImportTemplateData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IRIS';
  // The Revisión formulas are written without results: Excel computes them on open
  wb.calcProperties.fullCalcOnLoad = true;

  const lastRow = Math.max(FIRST_ROW, HEADER_ROW + data.projects.length);
  const ws = wb.addWorksheet(JUROR_IMPORT_SHEET, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  });
  const columns: { width: number; hidden?: boolean }[] = [
    ...FIXED_COLUMNS,
    ...Array.from({ length: JUROR_SLOTS }, () => SLOT_COLUMNS).flat(),
    { width: 34 },
    { width: 50 },
    { width: 13, hidden: true },
  ];
  ws.columns = columns.map(({ width, hidden }) => ({
    width,
    hidden,
    style: { font: FONT },
  }));

  const title = ws.getCell(1, 1);
  title.value = `Asignación de jurados · ${data.eventName}`;
  title.font = { ...FONT, size: 14, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 17.4;

  const legend = ws.getCell(2, 1);
  legend.value = LEGEND;
  legend.font = { ...FONT, italic: true, color: { argb: SUBTITLE_FONT } };
  legend.alignment = { vertical: 'top', wrapText: true };
  ws.mergeCells(2, 1, 2, LAST_COLUMN);
  ws.getRow(2).height = 30;

  const headers = [
    ...FIXED_COLUMNS.map(({ header }) => header),
    ...Array.from({ length: JUROR_SLOTS }, (_, i) =>
      SLOT_COLUMNS.map(({ header }) => `${header} ${i + 1}`),
    ).flat(),
    'Revisión (auto)',
    'Notas sobre los datos',
  ];
  headers.forEach((header, i) => {
    ws.getCell(HEADER_ROW, i + 1).value = header;
  });
  styleHeader(ws.getRow(HEADER_ROW));

  data.projects.forEach((project, i) => {
    const r = FIRST_ROW + i;
    const row = ws.getRow(r);
    row.values = [
      project.department,
      codeCell(project.projectCode),
      project.name,
      project.tutors.join('\n') || null,
      project.members.join('\n') || null,
      project.members.length,
    ];
    // Same height the cell would need with one line per member
    const lines = Math.max(project.members.length, project.tutors.length, 1);
    row.height = Math.max(15, lines * 13.5);
    row.getCell(LAST_COLUMN - 1).value = {
      formula: reviewFormula(r, !project.projectCode),
    };
    row.getCell(LAST_COLUMN + 1).value = {
      formula: normalize(`D${r}`),
    };
    for (let c = 1; c <= LAST_COLUMN; c++) {
      const cell = row.getCell(c);
      const input = c > 6 && c <= 6 + JUROR_SLOTS * 3;
      cell.border = border;
      if (c <= 6) cell.fill = fill(AUTO_FILL);
      else if (input) cell.fill = fill(INPUT_FILL);
      else if (c === LAST_COLUMN) cell.fill = fill(NOTES_FILL);
      cell.font =
        c === LAST_COLUMN - 1
          ? { ...FONT, bold: true }
          : c === LAST_COLUMN
            ? { ...FONT, size: 9, color: { argb: OLIVE } }
            : FONT;
      cell.alignment =
        c === 2 || c === 6
          ? { horizontal: 'center', vertical: 'top' }
          : { vertical: 'top', wrapText: true };
    }
    row.getCell(LAST_COLUMN + 1).font = {
      name: 'Arial',
      size: 8,
      color: { argb: MUTED_FONT },
    };
  });

  // A juror that looks like the tutor is painted in red, name and last name together
  for (let s = 1, priority = 2; s <= JUROR_SLOTS; s++) {
    const [first, last] = slotColumns(s);
    ws.addConditionalFormatting({
      ref: `${first}${FIRST_ROW}:${last}${lastRow}`,
      rules: [
        {
          type: 'expression',
          priority: priority++,
          formulae: [
            looksLikeTutor(
              `$${first}${FIRST_ROW}`,
              `$${last}${FIRST_ROW}`,
              String(FIRST_ROW),
            ),
          ],
          style: {
            font: { bold: true, color: { argb: TUTOR_FONT } },
            fill: {
              type: 'pattern',
              pattern: 'solid',
              bgColor: { argb: TUTOR_FILL },
            },
          },
        },
      ],
    });
  }
  ws.addConditionalFormatting({
    ref: `${REVIEW_COL}${FIRST_ROW}:${REVIEW_COL}${lastRow}`,
    rules: [
      {
        type: 'expression',
        priority: 151,
        formulae: [`${REVIEW_COL}${FIRST_ROW}="Sin jurados"`],
        style: { font: { italic: true, color: { argb: MUTED_FONT } } },
      },
      {
        type: 'expression',
        priority: 150,
        formulae: [`ISNUMBER(SEARCH("tutor",${REVIEW_COL}${FIRST_ROW}))`],
        style: { font: { bold: true, color: { argb: TUTOR_FONT } } },
      },
    ],
  });
  ws.autoFilter = `A${HEADER_ROW}:${NOTES_COL}${lastRow}`;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
