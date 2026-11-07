import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export const JUROR_IMPORT_SHEET = 'Asignaciones';
export const JUROR_IMPORT_MAX_ROWS = 2000;
export const JUROR_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

/** One data row of the sheet, ready for project-service (PreviewJurorImportRequest.rows) */
export interface JurorImportSheetRow {
  rowNumber: number;
  department: string;
  projectCode: string;
  jurorName: string;
  email: string;
}

type Field = Exclude<keyof JurorImportSheetRow, 'rowNumber'>;

/** Columns read by normalized header text; any other column ("(auto)" ones included) is ignored */
const COLUMNS: { header: string; label: string; field: Field }[] = [
  { header: 'departamento', label: 'Departamento', field: 'department' },
  { header: 'numero', label: 'Número', field: 'projectCode' },
  { header: 'jurado', label: 'Jurado', field: 'jurorName' },
  { header: 'email', label: 'Email', field: 'email' },
];

/** "Número*" -> "numero" */
const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Plain text of a cell, whatever Excel stored: number, hyperlink, rich text or formula */
export const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) {
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  }
  if ('hyperlink' in value) {
    const text = cellText(value.text as ExcelJS.CellValue);
    return text || value.hyperlink.replace(/^mailto:/i, '').trim();
  }
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  // { error: '#N/A' } and anything else
  return '';
};

/**
 * Reads the "Asignaciones" sheet of the juror template. Only converts the format:
 * every business rule lives in project-service.
 */
export async function parseJurorImportSheet(
  buffer: Buffer,
): Promise<JurorImportSheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('El archivo no es un Excel .xlsx válido.');
  }

  const sheet = workbook.worksheets.find(
    (ws) => normalizeHeader(ws.name) === normalizeHeader(JUROR_IMPORT_SHEET),
  );
  if (!sheet) {
    throw new BadRequestException(
      `No se encontró la hoja «${JUROR_IMPORT_SHEET}».`,
    );
  }

  const columnByField = new Map<Field, number>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellText(cell.value));
    const column = COLUMNS.find((c) => c.header === header);
    if (!column) return;
    if (columnByField.has(column.field)) {
      throw new BadRequestException(
        `La columna «${column.label}» aparece más de una vez.`,
      );
    }
    columnByField.set(column.field, colNumber);
  });
  const missing = COLUMNS.filter((c) => !columnByField.has(c.field));
  if (missing.length) {
    throw new BadRequestException(
      `Faltan columnas en la hoja «${JUROR_IMPORT_SHEET}»: ${missing.map((c) => c.label).join(', ')}.`,
    );
  }

  const rows: JurorImportSheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const value = (field: Field) =>
      cellText(row.getCell(columnByField.get(field)!).value);
    const parsed: JurorImportSheetRow = {
      rowNumber,
      department: value('department'),
      projectCode: value('projectCode'),
      jurorName: value('jurorName'),
      email: value('email'),
    };
    // Rows with only the "(auto)" formulas are not data
    if (COLUMNS.every((c) => !parsed[c.field])) return;
    rows.push(parsed);
  });

  if (rows.length === 0) {
    throw new BadRequestException('El archivo no tiene filas con datos.');
  }
  if (rows.length > JUROR_IMPORT_MAX_ROWS) {
    throw new BadRequestException(
      `El archivo tiene ${rows.length} filas con datos; el máximo es ${JUROR_IMPORT_MAX_ROWS}.`,
    );
  }
  return rows;
}
