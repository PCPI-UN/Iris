/** Format of the juror template, shared by the parser and the template builder */
export const JUROR_IMPORT_SHEET = 'Asignación jurados';
export const JUROR_IMPORT_MAX_ROWS = 2000;
export const JUROR_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** The title and the color legend come first: the headers are searched in the first rows */
export const JUROR_IMPORT_HEADER_SEARCH_ROWS = 20;

/** One juror of one project row, ready for project-service (PreviewJurorImportRequest.rows) */
export interface JurorImportSheetRow {
  rowNumber: number;
  department: string;
  projectCode: string;
  /** N of "Nombre(s) jurado N", starting at 1 */
  jurorSlot: number;
  firstName: string;
  lastName: string;
  email: string;
}

/** Columns that appear once per project row; found by their normalized label, in any order */
export const JUROR_IMPORT_FIXED_COLUMNS = [
  { field: 'department', label: 'Departamento' },
  { field: 'projectCode', label: 'Número' },
] as const;

/** Columns repeated per juror: "Nombre(s) jurado 1", "Apellido(s) jurado 1", "Correo jurado 1"... */
export const JUROR_IMPORT_SLOT_COLUMNS = [
  { field: 'firstName', label: 'Nombre(s) jurado' },
  { field: 'lastName', label: 'Apellido(s) jurado' },
  { field: 'email', label: 'Correo jurado' },
] as const;

/** "Número*" -> "numero" */
export const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
