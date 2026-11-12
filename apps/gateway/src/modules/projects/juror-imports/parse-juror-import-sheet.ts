import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  JUROR_IMPORT_FIXED_COLUMNS,
  JUROR_IMPORT_HEADER_SEARCH_ROWS,
  JUROR_IMPORT_MAX_ROWS,
  JUROR_IMPORT_SHEET,
  JUROR_IMPORT_SLOT_COLUMNS,
  JurorImportSheetRow,
  normalizeHeader,
} from './juror-import-format';

type SlotField = (typeof JUROR_IMPORT_SLOT_COLUMNS)[number]['field'];
type SlotColumns = Partial<Record<SlotField, number>>;

const FIXED = JUROR_IMPORT_FIXED_COLUMNS.map((column) => ({
  ...column,
  header: normalizeHeader(column.label),
}));
const SLOT_PREFIXES = JUROR_IMPORT_SLOT_COLUMNS.map((column) => ({
  ...column,
  prefix: normalizeHeader(column.label),
}));

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
    const text = cellText(value.text);
    return text || value.hyperlink.replace(/^mailto:/i, '').trim();
  }
  if ('formula' in value || 'sharedFormula' in value) {
    return cellText(value.result);
  }
  // { error: '#N/A' } and anything else
  return '';
};

/** Header of a juror column -> its field and N ("nombre(s) jurado 2" -> firstName, 2) */
const matchSlotHeader = (header: string) => {
  for (const { field, prefix } of SLOT_PREFIXES) {
    if (!header.startsWith(`${prefix} `)) continue;
    const suffix = header.slice(prefix.length + 1);
    if (/^\d+$/.test(suffix)) return { field, slot: Number(suffix) };
  }
  return null;
};

/**
 * Reads the "Asignación jurados" sheet of the juror template: one row per project with up to
 * N jurors, each as a group of columns. Returns one entry per juror group with some data.
 * Only converts the format: every business rule lives in project-service.
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

  // The headers row is the first one (of the first rows) that has the fixed columns
  let headerRow = 0;
  const fixedColumns = new Map<string, number>();
  const slots = new Map<number, SlotColumns>();
  for (
    let r = 1;
    r <= Math.min(JUROR_IMPORT_HEADER_SEARCH_ROWS, sheet.rowCount) &&
    !headerRow;
    r++
  ) {
    const found = new Map<string, number>();
    sheet.getRow(r).eachCell((cell, colNumber) => {
      const header = normalizeHeader(cellText(cell.value));
      const fixed = FIXED.find((c) => c.header === header);
      if (fixed && !found.has(fixed.field)) found.set(fixed.field, colNumber);
    });
    if (found.size === FIXED.length) {
      headerRow = r;
      found.forEach((col, field) => fixedColumns.set(field, col));
    }
  }
  if (!headerRow) {
    throw new BadRequestException(
      `Faltan columnas en la hoja «${JUROR_IMPORT_SHEET}»: ${FIXED.map((c) => c.label).join(', ')}. Los encabezados deben estar en las primeras ${JUROR_IMPORT_HEADER_SEARCH_ROWS} filas.`,
    );
  }

  sheet.getRow(headerRow).eachCell((cell, colNumber) => {
    const match = matchSlotHeader(normalizeHeader(cellText(cell.value)));
    if (!match) return;
    const columns = slots.get(match.slot) ?? {};
    if (columns[match.field]) {
      throw new BadRequestException(
        `La columna «${cell.text.trim()}» aparece más de una vez.`,
      );
    }
    columns[match.field] = colNumber;
    slots.set(match.slot, columns);
  });
  if (slots.size === 0) {
    throw new BadRequestException(
      `Faltan las columnas de jurados (${SLOT_PREFIXES.map((c) => `${c.label} N`).join(', ')}) en la hoja «${JUROR_IMPORT_SHEET}».`,
    );
  }
  const ordered = [...slots.entries()].sort(([a], [b]) => a - b);

  const rows: JurorImportSheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const text = (col: number | undefined) =>
      col ? cellText(row.getCell(col).value) : '';
    const department = text(fixedColumns.get('department'));
    const projectCode = text(fixedColumns.get('projectCode'));
    for (const [slot, columns] of ordered) {
      const firstName = text(columns.firstName);
      const lastName = text(columns.lastName);
      const email = text(columns.email);
      // A group with nothing written is an empty juror slot, not an entry
      if (!firstName && !lastName && !email) continue;
      rows.push({
        rowNumber,
        department,
        projectCode,
        jurorSlot: slot,
        firstName,
        lastName,
        email,
      });
    }
  });

  if (rows.length === 0) {
    throw new BadRequestException('El archivo no tiene jurados.');
  }
  if (rows.length > JUROR_IMPORT_MAX_ROWS) {
    throw new BadRequestException(
      `El archivo tiene ${rows.length} jurados; el máximo es ${JUROR_IMPORT_MAX_ROWS}.`,
    );
  }
  return rows;
}
