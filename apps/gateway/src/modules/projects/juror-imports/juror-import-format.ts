/** Format of the juror template, shared by the parser and the template builder */
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

export type JurorImportField = Exclude<keyof JurorImportSheetRow, 'rowNumber'>;

/**
 * Columns filled by the person who uploads the file. The template writes "label*" as header;
 * the parser finds each column by its normalized label, in any order.
 */
export const JUROR_IMPORT_COLUMNS: {
  field: JurorImportField;
  label: string;
}[] = [
  { field: 'department', label: 'Departamento' },
  { field: 'projectCode', label: 'Número' },
  { field: 'jurorName', label: 'Jurado' },
  { field: 'email', label: 'Email' },
];

/** "Número*" -> "numero" */
export const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
