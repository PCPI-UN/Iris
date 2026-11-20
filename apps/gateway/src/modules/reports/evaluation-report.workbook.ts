import * as ExcelJS from 'exceljs';
import { solidFill, thinBorder } from '../../common/excel/excel-styles';
import { fileNamePart } from '../../common/excel/xlsx-file';
import {
  EvaluationReport,
  EvaluationReportProject,
} from './evaluation-report.types';

/**
 * Excel of the evaluation report, with the format approved on 28 Oct
 * (Reporte_Evaluacion_Feria_Proyectos.xlsx):
 *
 * - "Resumen por Proyecto": one row per project with its final grade, position, number
 *   of jurors and the jurors' comments joined with " | ". The student's report leaves the
 *   "N° de Jurados" column out of both sheets (not hidden: it is not written).
 * - "Detalle por Criterio": one row per criterion with its component, weights and the
 *   jurors' average; the project cells are merged over its rows and the component cells
 *   over its criteria.
 *
 * Both sheets have the title band, the header in row 4 (frozen) and a note under the
 * data. The final grade is colored by its share of the highest grade (see scoreBand).
 */

export const SUMMARY_SHEET = 'Resumen por Proyecto';
export const DETAIL_SHEET = 'Detalle por Criterio';
export const HEADER_ROW = 4;
export const NO_COMMENTS = 'Sin comentarios registrados';
export const NOT_EVALUATED = 'Sin evaluar';
export const NO_EVALUATIONS = 'Sin evaluaciones registradas';

const COLORS = {
  band: 'FF1F3864',
  subtitle: 'FFD9D9D9',
  white: 'FFFFFFFF',
  stripe: 'FFF2F2F2',
  component: 'FFE2EFDA',
  border: 'FFB7B7B7',
  note: 'FF7F7F7F',
  high: 'FFC6EFCE',
  mid: 'FFFFEB9C',
  low: 'FFFFC7CE',
} as const;

/** Share of the highest grade from which a final grade is green or yellow */
export const SCORE_BANDS = { high: 0.84, mid: 0.75 } as const;

export type ScoreBand = 'high' | 'mid' | 'low';

/** Green from 84 % of the highest grade, yellow from 75 %, red below */
export function scoreBand(score: number, maxScore: number): ScoreBand {
  const share = maxScore > 0 ? score / maxScore : 0;
  if (share >= SCORE_BANDS.high) return 'high';
  if (share >= SCORE_BANDS.mid) return 'mid';
  return 'low';
}

interface ColumnDef<K extends string> {
  key: K;
  header: string;
  width: number;
  /** Long texts go top-left; everything else is centered */
  text?: boolean;
}

interface Columns<K extends string> {
  list: ColumnDef<K>[];
  /** 1-based column of a key; 0 when the column is not in the report */
  at: (key: K) => number;
}

type SummaryKey =
  | 'code'
  | 'id'
  | 'name'
  | 'members'
  | 'score'
  | 'position'
  | 'jurors'
  | 'comments';

const SUMMARY_COLUMNS: ColumnDef<SummaryKey>[] = [
  { key: 'code', header: 'Código', width: 10 },
  { key: 'id', header: 'ID Proyecto', width: 12 },
  { key: 'name', header: 'Nombre del Proyecto', width: 42, text: true },
  { key: 'members', header: 'Integrantes del Equipo', width: 42, text: true },
  { key: 'score', header: 'Puntaje Final', width: 13 },
  { key: 'position', header: 'Posición', width: 11 },
  { key: 'jurors', header: 'N° de Jurados', width: 13 },
  {
    key: 'comments',
    header: 'Comentarios Consolidados',
    width: 60,
    text: true,
  },
];

type DetailKey =
  | 'code'
  | 'name'
  | 'members'
  | 'component'
  | 'componentWeight'
  | 'criterion'
  | 'criterionWeight'
  | 'criterionScore'
  | 'score'
  | 'jurors'
  | 'comments';

const DETAIL_COLUMNS: ColumnDef<DetailKey>[] = [
  { key: 'code', header: 'Código', width: 9 },
  { key: 'name', header: 'Nombre del Proyecto', width: 34, text: true },
  { key: 'members', header: 'Integrantes del Equipo', width: 34, text: true },
  { key: 'component', header: 'Componente', width: 20 },
  { key: 'componentWeight', header: 'Peso del Componente', width: 12 },
  { key: 'criterion', header: 'Criterio', width: 46, text: true },
  { key: 'criterionWeight', header: 'Peso del Criterio', width: 12 },
  { key: 'criterionScore', header: 'Nota del Criterio', width: 12 },
  { key: 'score', header: 'Puntaje Final del Proyecto', width: 14 },
  { key: 'jurors', header: 'N° de Jurados', width: 11 },
  {
    key: 'comments',
    header: 'Comentarios Consolidados',
    width: 46,
    text: true,
  },
];

/**
 * The columns of the report: without "N° de Jurados" in the student's report, and
 * without "Posición" when the report carries no positions (filtered report of an event
 * without ranking configuration). Left out, not hidden: the values are not written.
 */
function columnsFor<K extends string>(
  columns: ColumnDef<K>[],
  report: EvaluationReport,
): Columns<K> {
  const left = new Set<string>();
  if (!report.showJurorCount) left.add('jurors');
  if (!report.showPositions) left.add('position');
  const list = columns.filter((column) => !left.has(column.key));
  const at = (key: K) => list.findIndex((column) => column.key === key) + 1;
  return { list, at };
}

function setWidths<K extends string>(
  sheet: ExcelJS.Worksheet,
  columns: ColumnDef<K>[],
): void {
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
}

const SCORE_FORMAT = '0.00';
const WEIGHT_FORMAT = '0.000';

const border = thinBorder(COLORS.border);

const center: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
};
const topLeft: Partial<ExcelJS.Alignment> = {
  horizontal: 'left',
  vertical: 'top',
  wrapText: true,
};

export function commentsText(project: EvaluationReportProject): string {
  return project.comments.length ? project.comments.join(' | ') : NO_COMMENTS;
}

export function buildEvaluationReportWorkbook(
  report: EvaluationReport,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IRIS';
  workbook.created = report.generatedAt;

  addSummarySheet(workbook, report);
  addDetailSheet(workbook, report);

  return workbook;
}

export async function buildEvaluationReportBuffer(
  report: EvaluationReport,
): Promise<Buffer> {
  const raw = await buildEvaluationReportWorkbook(report).xlsx.writeBuffer();
  return Buffer.from(raw);
}

function addTitle(
  sheet: ExcelJS.Worksheet,
  columns: number,
  title: string,
  subtitle: string,
): void {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.mergeCells(2, 1, 2, columns);

  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = {
    name: 'Calibri',
    size: 16,
    bold: true,
    color: { argb: COLORS.white },
  };
  titleCell.fill = solidFill(COLORS.band);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;

  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = {
    name: 'Calibri',
    size: 10,
    italic: true,
    color: { argb: COLORS.subtitle },
  };
  subtitleCell.fill = solidFill(COLORS.band);
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 18;
}

function addHeader(
  sheet: ExcelJS.Worksheet,
  headers: string[],
  height: number,
): void {
  const row = sheet.getRow(HEADER_ROW);
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: COLORS.white },
    };
    cell.fill = solidFill(COLORS.band);
    cell.alignment = center;
    cell.border = border;
  });
  row.height = height;
}

function addNote(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: number,
  text: string,
): void {
  sheet.mergeCells(rowNumber, 1, rowNumber, columns);
  const cell = sheet.getCell(rowNumber, 1);
  cell.value = text;
  cell.font = {
    name: 'Calibri',
    size: 9,
    italic: true,
    color: { argb: COLORS.note },
  };
  cell.alignment = { vertical: 'top', wrapText: true };
  sheet.getRow(rowNumber).height = 30;
}

function styleScore(
  cell: ExcelJS.Cell,
  project: EvaluationReportProject,
  maxScore: number,
): void {
  cell.font = { name: 'Calibri', size: 10, bold: true };
  if (project.finalScore === null) return;
  cell.numFmt = SCORE_FORMAT;
  cell.fill = solidFill(COLORS[scoreBand(project.finalScore, maxScore)]);
}

function formatDate(date: Date): string {
  return date.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  report: EvaluationReport,
): void {
  const sheet = workbook.addWorksheet(SUMMARY_SHEET, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, topLeftCell: 'A5' }],
  });
  const columns = columnsFor(SUMMARY_COLUMNS, report);
  setWidths(sheet, columns.list);

  addTitle(
    sheet,
    columns.list.length,
    `REPORTE DE EVALUACIÓN — ${report.eventName.toUpperCase()}`,
    `${report.categoryName} — Resumen consolidado por proyecto`,
  );
  addHeader(
    sheet,
    columns.list.map((column) => column.header),
    26,
  );

  report.projects.forEach((project, index) => {
    const row = sheet.getRow(HEADER_ROW + 1 + index);
    const values: Record<SummaryKey, ExcelJS.CellValue> = {
      code: project.rowNumber,
      id: project.projectId,
      name: project.projectName,
      members: project.participantNames.join(', '),
      score: project.finalScore ?? NOT_EVALUATED,
      position: project.position ?? '—',
      jurors: project.jurorCount,
      comments: commentsText(project),
    };

    const striped = index % 2 === 1;
    columns.list.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = values[column.key];
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = border;
      cell.alignment = column.text ? topLeft : center;
      if (striped) cell.fill = solidFill(COLORS.stripe);
    });
    styleScore(row.getCell(columns.at('score')), project, report.maxScore);
  });

  const lastRow = HEADER_ROW + report.projects.length;
  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: Math.max(lastRow, HEADER_ROW), column: columns.list.length },
  };

  addNote(
    sheet,
    lastRow + 2,
    columns.list.length,
    'Nota: Puntaje Final = promedio del puntaje otorgado por cada jurado al proyecto. ' +
      (report.showPositions
        ? 'Posición según el ranking de IRIS en la categoría: los proyectos con el mismo ' +
          'promedio comparten la posición (coganadores). Los proyectos sin evaluaciones ' +
          'van al final, sin puntaje ni posición. '
        : 'Los proyectos sin evaluaciones van al final, sin puntaje. ') +
      `Generado por IRIS el ${formatDate(report.generatedAt)}.`,
  );
}

function addDetailSheet(
  workbook: ExcelJS.Workbook,
  report: EvaluationReport,
): void {
  const sheet = workbook.addWorksheet(DETAIL_SHEET, {
    views: [
      { state: 'frozen', xSplit: 3, ySplit: HEADER_ROW, topLeftCell: 'D5' },
    ],
  });
  const columns = columnsFor(DETAIL_COLUMNS, report);
  setWidths(sheet, columns.list);

  addTitle(
    sheet,
    columns.list.length,
    'DETALLE DE CALIFICACIÓN POR COMPONENTE Y CRITERIO',
    `${report.categoryName} — Notas promedio por criterio (promedio entre jurados evaluadores)`,
  );
  addHeader(
    sheet,
    columns.list.map((column) => column.header),
    30,
  );

  let rowNumber = HEADER_ROW + 1;
  for (const project of report.projects) {
    rowNumber = addProjectBlock(sheet, report, columns, project, rowNumber);
  }

  addNote(
    sheet,
    rowNumber + 1,
    columns.list.length,
    "Nota: 'Nota del Criterio' es el promedio de las notas otorgadas por los jurados a ese " +
      "criterio. 'Peso del Criterio' es el peso efectivo que tuvo el criterio en la nota " +
      '(fracción de 1) y el peso del componente es la suma de los pesos de sus criterios.',
  );
}

/** Writes the rows of one project and returns the next free row */
function addProjectBlock(
  sheet: ExcelJS.Worksheet,
  report: EvaluationReport,
  columns: Columns<DetailKey>,
  project: EvaluationReportProject,
  firstRow: number,
): number {
  const { at } = columns;
  const criteriaCount = project.components.reduce(
    (sum, component) => sum + component.criteria.length,
    0,
  );
  const lastRow = firstRow + Math.max(criteriaCount, 1) - 1;

  // Every cell of the block gets the base style, so merged cells keep their borders
  for (let r = firstRow; r <= lastRow; r += 1) {
    const row = sheet.getRow(r);
    columns.list.forEach((column, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = border;
      cell.alignment = column.text ? topLeft : center;
    });
  }

  // Project cells, merged over all its rows
  const projectValues: Array<[DetailKey, ExcelJS.CellValue]> = [
    ['code', project.rowNumber],
    ['name', project.projectName],
    ['members', project.participantNames.join(', ')],
    ['score', project.finalScore ?? NOT_EVALUATED],
    ['jurors', project.jurorCount],
    ['comments', commentsText(project)],
  ];
  for (const [key, value] of projectValues) {
    const column = at(key);
    if (!column) continue; // "N° de Jurados" is not in the student's report
    if (lastRow > firstRow) sheet.mergeCells(firstRow, column, lastRow, column);
    sheet.getCell(firstRow, column).value = value;
  }
  sheet.getCell(firstRow, at('code')).font = {
    name: 'Calibri',
    size: 10,
    bold: true,
  };
  styleScore(sheet.getCell(firstRow, at('score')), project, report.maxScore);

  if (!criteriaCount) {
    sheet.getCell(firstRow, at('criterion')).value = NO_EVALUATIONS;
    return lastRow + 1;
  }

  let r = firstRow;
  for (const component of project.components) {
    const componentLast = r + component.criteria.length - 1;
    const nameColumn = at('component');
    const weightColumn = at('componentWeight');
    if (componentLast > r) {
      sheet.mergeCells(r, nameColumn, componentLast, nameColumn);
      sheet.mergeCells(r, weightColumn, componentLast, weightColumn);
    }
    const name = sheet.getCell(r, nameColumn);
    name.value = component.component;
    const weight = sheet.getCell(r, weightColumn);
    weight.value = component.weight;
    weight.numFmt = WEIGHT_FORMAT;
    for (let cr = r; cr <= componentLast; cr += 1) {
      sheet.getCell(cr, nameColumn).fill = solidFill(COLORS.component);
      sheet.getCell(cr, weightColumn).fill = solidFill(COLORS.component);
    }

    for (const criterion of component.criteria) {
      sheet.getCell(r, at('criterion')).value = criterion.criterion;
      const criterionWeight = sheet.getCell(r, at('criterionWeight'));
      criterionWeight.value = criterion.weight;
      criterionWeight.numFmt = WEIGHT_FORMAT;
      const score = sheet.getCell(r, at('criterionScore'));
      score.value = criterion.score;
      score.numFmt = SCORE_FORMAT;
      r += 1;
    }
  }

  return lastRow + 1;
}

export function evaluationReportFileName(report: EvaluationReport): string {
  return `reporte_evaluacion_${fileNamePart(report.categoryName)}_${fileNamePart(report.eventName)}.xlsx`;
}
