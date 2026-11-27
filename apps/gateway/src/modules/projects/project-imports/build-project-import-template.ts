import * as ExcelJS from 'exceljs';
import { GetProjectImportTemplateResponse } from '@app/common/generated/project';
import { solidFill, thinBorder } from '../../../common/excel/excel-styles';
import {
  PROJECT_IMPORT_CAREERS,
  PROJECT_IMPORT_FIXED_COLUMNS,
  PROJECT_IMPORT_MAX_PARTICIPANTS,
  PROJECT_IMPORT_MAX_ROWS,
  PROJECT_IMPORT_MAX_TUTORS,
  PROJECT_IMPORT_PARTICIPANT_COLUMNS,
  PROJECT_IMPORT_SEMESTERS,
  PROJECT_IMPORT_SHEET,
  PROJECT_IMPORT_STATE_LABELS,
  PROJECT_IMPORT_TUTOR_COLUMN,
} from './project-import-format';

/** Data of the event, as GetProjectImportTemplate returns it */
export type ProjectImportTemplateData = Pick<
  GetProjectImportTemplateResponse,
  'eventName' | 'categoryNames' | 'requiresCourse'
>;

/** Hidden sheet with the values of the dropdowns */
export const PROJECT_IMPORT_LISTS_SHEET = 'Listas';
export const PROJECT_IMPORT_INSTRUCTIONS_SHEET = 'Instrucciones';

/** Title, color legend and a blank row come first; the headers are the 6th row */
const LEGEND_ROW = 2;
const HEADER_ROW = 6;
const FIRST_ROW = HEADER_ROW + 1;
const LAST_ROW = HEADER_ROW + PROJECT_IMPORT_MAX_ROWS;

const NAVY = 'FF1F3864';
const OPTIONAL_HEADER = 'FF8497B0';
const GRID = 'FFBFBFBF';

const FONT: Partial<ExcelJS.Font> = { name: 'Arial', size: 10 };

/** One line per color, painted with that color, under the "Colores" title */
const LEGEND: { text: string; fill: string }[] = [
  { text: 'Azul oscuro: columna obligatoria (lleva *).', fill: NAVY },
  { text: 'Azul claro: columna opcional.', fill: OPTIONAL_HEADER },
];

type ListColumn = 'categories' | 'states' | 'semesters' | 'careers';

/** Column of each dropdown list in the hidden sheet, in that order (A, B, C, D) */
const LIST_ORDER: ListColumn[] = [
  'categories',
  'states',
  'semesters',
  'careers',
];

interface TemplateColumn {
  header: string;
  width: number;
  required: boolean;
  /** Dropdown of the column, when it has one */
  list?: ListColumn;
}

const FIXED_WIDTHS: Record<string, number> = {
  categoryName: 24,
  nrc: 12,
  name: 40,
  description: 40,
  projectCode: 12,
  state: 14,
};
const FIXED_LISTS: Record<string, ListColumn | undefined> = {
  categoryName: 'categories',
  state: 'states',
};
const PARTICIPANT_WIDTHS: Record<string, number> = {
  firstName: 20,
  lastName: 22,
  email: 30,
  studentCode: 16,
  semester: 16,
  career: 32,
};
const PARTICIPANT_LISTS: Record<string, ListColumn | undefined> = {
  semester: 'semesters',
  career: 'careers',
};

/** Columns of the sheet in order; the star marks the required ones */
function templateColumns(requiresCourse: boolean): TemplateColumn[] {
  const columns: TemplateColumn[] = PROJECT_IMPORT_FIXED_COLUMNS.map((c) => {
    const required = c.required || (c.field === 'nrc' && requiresCourse);
    return {
      header: required ? `${c.label}*` : c.label,
      width: FIXED_WIDTHS[c.field],
      required,
      list: FIXED_LISTS[c.field],
    };
  });
  for (let n = 1; n <= PROJECT_IMPORT_MAX_PARTICIPANTS; n++) {
    for (const c of PROJECT_IMPORT_PARTICIPANT_COLUMNS) {
      // Only the first student is required
      columns.push({
        header: n === 1 ? `${c.label} ${n}*` : `${c.label} ${n}`,
        width: PARTICIPANT_WIDTHS[c.field],
        required: n === 1,
        list: PARTICIPANT_LISTS[c.field],
      });
    }
  }
  for (let n = 1; n <= PROJECT_IMPORT_MAX_TUTORS; n++) {
    columns.push({
      header: `${PROJECT_IMPORT_TUTOR_COLUMN.label} ${n}`,
      width: 30,
      required: false,
    });
  }
  return columns;
}

/** Values of each dropdown list, written to the hidden sheet */
function listValues(
  data: ProjectImportTemplateData,
): Record<ListColumn, string[]> {
  return {
    categories: data.categoryNames,
    states: [...PROJECT_IMPORT_STATE_LABELS],
    semesters: PROJECT_IMPORT_SEMESTERS.map((s) => s.label),
    careers: PROJECT_IMPORT_CAREERS.map((c) => c.label),
  };
}

/**
 * exceljs writes `dataValidations` but its typings omit it. The key is the written `sqref`, so a
 * range covers all its cells with one entry instead of one per cell.
 */
const dataValidations = (ws: ExcelJS.Worksheet) =>
  (
    ws as unknown as {
      dataValidations: {
        add: (range: string, validation: ExcelJS.DataValidation) => void;
      };
    }
  ).dataValidations;

/** Rows of the "Instrucciones" sheet, in Spanish: it is what the admin reads */
function instructions(data: ProjectImportTemplateData): string[] {
  return [
    `Carga masiva de proyectos · ${data.eventName}`,
    '',
    `1. Diligencie la hoja «${PROJECT_IMPORT_SHEET}»: una fila por proyecto. Máximo ${PROJECT_IMPORT_MAX_ROWS} filas y 2 MB.`,
    '2. Las columnas con * son obligatorias. Categoría, Estado, Semestre y Carrera se eligen de la lista desplegable.',
    data.requiresCourse
      ? '3. Este evento exige NRC: debe existir en el periodo académico del evento.'
      : '3. Este evento no usa NRC: la columna se ignora.',
    `4. El integrante 1 es obligatorio; hay hasta ${PROJECT_IMPORT_MAX_PARTICIPANTS} integrantes. Si se llena una celda de un integrante, se llenan todas las de ese integrante.`,
    `5. Los tutores son opcionales (hasta ${PROJECT_IMPORT_MAX_TUTORS}): se escribe el correo de cada uno.`,
    '6. Estado vacío equivale a Aprobado. «En revisión» deja el proyecto pendiente de revisión.',
    '7. No cambie los nombres de los encabezados ni de las hojas. Las columnas pueden ir en cualquier orden.',
    '8. Los documentos del proyecto no van en el Excel: se suben después desde el detalle de cada proyecto.',
    '9. Al subir el archivo se muestra una vista previa por fila. La carga solo se confirma si no hay errores.',
    '10. Volver a cargar el mismo archivo no duplica proyectos: los que ya existen se omiten.',
  ];
}

/**
 * Builds the project template of an event: a "Proyectos" sheet with the headers and dropdowns
 * (category, state, semester, career) fed by a hidden "Listas" sheet, plus an "Instrucciones" sheet.
 */
export async function buildProjectImportTemplate(
  data: ProjectImportTemplateData,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IRIS';
  const border = thinBorder(GRID);

  const ws = wb.addWorksheet(PROJECT_IMPORT_SHEET, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  });
  const columns = templateColumns(data.requiresCourse);
  ws.columns = columns.map(({ width }) => ({ width, style: { font: FONT } }));

  const title = ws.getCell(1, 1);
  title.value = `Proyectos · ${data.eventName}`;
  title.font = { ...FONT, size: 14, bold: true, color: { argb: NAVY } };
  ws.getRow(1).height = 17.4;

  const legendTitle = ws.getCell(LEGEND_ROW, 1);
  legendTitle.value = 'Colores';
  legendTitle.font = { ...FONT, size: 11, bold: true, color: { argb: NAVY } };
  LEGEND.forEach(({ text, fill }, i) => {
    const r = LEGEND_ROW + 1 + i;
    ws.mergeCells(r, 1, r, 4);
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.fill = solidFill(fill);
    cell.font = { ...FONT, color: { argb: 'FFFFFFFF' } };
  });

  const headerRow = ws.getRow(HEADER_ROW);
  headerRow.height = 30;
  columns.forEach(({ header, required }, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = header;
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solidFill(required ? NAVY : OPTIONAL_HEADER);
    cell.border = border;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
  });
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: columns.length },
  };

  // Hidden sheet: one column per list, header in row 1 and the values below it
  const lists = wb.addWorksheet(PROJECT_IMPORT_LISTS_SHEET, {
    state: 'hidden',
  });
  const values = listValues(data);
  const listRange = new Map<ListColumn, string>();
  LIST_ORDER.forEach((key, i) => {
    const letter = lists.getColumn(i + 1).letter;
    lists.getCell(1, i + 1).value = key;
    values[key].forEach((value, j) => {
      lists.getCell(j + 2, i + 1).value = value;
    });
    // At least one row, so a dropdown over an empty list is still a valid range
    const last = Math.max(2, values[key].length + 1);
    listRange.set(
      key,
      `${PROJECT_IMPORT_LISTS_SHEET}!$${letter}$2:$${letter}$${last}`,
    );
  });

  columns.forEach(({ list }, i) => {
    if (!list) return;
    const letter = ws.getColumn(i + 1).letter;
    dataValidations(ws).add(`${letter}${FIRST_ROW}:${letter}${LAST_ROW}`, {
      type: 'list',
      allowBlank: true,
      formulae: [listRange.get(list)!],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Valor no válido',
      error: 'Elija un valor de la lista desplegable.',
    });
  });

  const guide = wb.addWorksheet(PROJECT_IMPORT_INSTRUCTIONS_SHEET);
  guide.getColumn(1).width = 120;
  instructions(data).forEach((text, i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = text;
    cell.font =
      i === 0 ? { ...FONT, size: 14, bold: true, color: { argb: NAVY } } : FONT;
    cell.alignment = { wrapText: true, vertical: 'top' };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
