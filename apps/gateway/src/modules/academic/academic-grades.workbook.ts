import * as ExcelJS from 'exceljs';
import { solidFill, thinBorder } from '../../common/excel/excel-styles';
import { fileNamePart } from '../../common/excel/xlsx-file';
import { GradeRow, GradesReport, GradeStatus } from './academic.types';

/**
 * Excel of the grades of the academic endpoints: the same rows as the JSON, already
 * filtered by the caller's scope and by the publication rule, so a hidden grade is
 * never in the file.
 */

export const GRADES_SHEET = 'Notas';
export const HEADER_ROW = 4;

export const STATUS_LABEL: Record<GradeStatus, string> = {
  PENDING: 'Evaluación pendiente',
  PRELIMINARY: 'Preliminar',
  OFFICIAL: 'Oficial',
};
export const HIDDEN_GRADE = 'No publicada';
export const NO_GRADE = 'Sin nota';

const HEADERS = [
  'Código',
  'Proyecto',
  'Integrantes',
  'NRC',
  'Curso',
  'Departamento',
  'Estado de la nota',
  'Evaluaciones hechas',
  'Jurados asignados',
  'Evaluaciones pendientes',
  'Nota',
];
const WIDTHS = [10, 38, 40, 10, 28, 22, 20, 13, 13, 14, 12];

const COLORS = {
  band: 'FF1F3864',
  subtitle: 'FFD9D9D9',
  white: 'FFFFFFFF',
  stripe: 'FFF2F2F2',
  border: 'FFB7B7B7',
  note: 'FF7F7F7F',
} as const;

const border = thinBorder(COLORS.border);

/** Text under the title: what the grades of this file are */
export function visibilityNote(report: GradesReport): string {
  if (report.resultsPublished) {
    return 'Resultados publicados: las notas son oficiales.';
  }
  return report.gradeVisibility === 'ALL'
    ? 'Resultados sin publicar: las notas son preliminares y pueden cambiar.'
    : 'Resultados sin publicar: las notas se mostrarán cuando el administrador publique los resultados.';
}

export function gradeCell(row: GradeRow): number | string {
  if (row.finalScore !== null) return row.finalScore;
  return row.gradeHidden ? HIDDEN_GRADE : NO_GRADE;
}

export function buildGradesWorkbook(report: GradesReport): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IRIS';
  workbook.created = report.generatedAt;

  const sheet = workbook.addWorksheet(GRADES_SHEET, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  });
  WIDTHS.forEach((width, i) => (sheet.getColumn(i + 1).width = width));

  sheet.mergeCells(1, 1, 1, HEADERS.length);
  const title = sheet.getCell(1, 1);
  title.value = `Notas - ${report.eventName}`;
  title.font = { size: 16, bold: true, color: { argb: COLORS.white } };
  title.fill = solidFill(COLORS.band);
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, HEADERS.length);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = visibilityNote(report);
  subtitle.font = { italic: true };
  subtitle.fill = solidFill(COLORS.subtitle);

  const header = sheet.getRow(HEADER_ROW);
  HEADERS.forEach((text, i) => {
    const cell = header.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = solidFill(COLORS.band);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  header.height = 30;

  report.projects.forEach((row, index) => {
    const excelRow = sheet.getRow(HEADER_ROW + 1 + index);
    excelRow.values = [
      row.projectCode ?? '',
      row.projectName,
      row.participantNames.join(', '),
      row.academicCourse?.nrc ?? '',
      row.academicCourse?.name ?? '',
      row.academicCourse?.departmentName ?? '',
      STATUS_LABEL[row.gradeStatus],
      row.completedEvaluations,
      row.assignedJurors,
      row.pendingEvaluations,
      gradeCell(row),
    ];
    excelRow.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.border = border;
      cell.alignment = {
        vertical: 'top',
        wrapText: true,
        horizontal: column >= 7 ? 'center' : 'left',
      };
      if (index % 2 === 1) cell.fill = solidFill(COLORS.stripe);
    });
    if (row.finalScore !== null) excelRow.getCell(11).numFmt = '0.00';
  });

  const noteRow = HEADER_ROW + report.projects.length + 2;
  const note = sheet.getCell(noteRow, 1);
  note.value = report.projects.length
    ? `Generado el ${report.generatedAt.toISOString().slice(0, 10)}. Solo se incluyen los proyectos aprobados de su ámbito.`
    : 'No hay proyectos aprobados de su ámbito en este evento.';
  note.font = { italic: true, color: { argb: COLORS.note } };

  return workbook;
}

export async function buildGradesBuffer(report: GradesReport): Promise<Buffer> {
  const raw = await buildGradesWorkbook(report).xlsx.writeBuffer();
  return Buffer.from(raw);
}

export function gradesFileName(report: GradesReport): string {
  return `notas_${fileNamePart(report.eventName)}.xlsx`;
}
