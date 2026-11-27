import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  ProjectImportParticipant,
  ProjectImportRow,
  ProjectState,
} from '@app/common/generated/project';
import { cellText, normalizeHeader } from '../../../common/excel/excel-cells';
import {
  PROJECT_IMPORT_FIXED_COLUMNS,
  PROJECT_IMPORT_HEADER_SEARCH_ROWS,
  PROJECT_IMPORT_MAX_PARTICIPANTS,
  PROJECT_IMPORT_MAX_ROWS,
  PROJECT_IMPORT_MAX_TUTORS,
  PROJECT_IMPORT_PARTICIPANT_COLUMNS,
  PROJECT_IMPORT_SHEET,
  PROJECT_IMPORT_STATE_APPROVED,
  PROJECT_IMPORT_STATE_UNDER_REVIEW,
  PROJECT_IMPORT_TUTOR_COLUMN,
} from './project-import-format';

type FixedField = (typeof PROJECT_IMPORT_FIXED_COLUMNS)[number]['field'];
type ParticipantField =
  (typeof PROJECT_IMPORT_PARTICIPANT_COLUMNS)[number]['field'];
type ParticipantColumns = Partial<Record<ParticipantField, number>>;

const FIXED = PROJECT_IMPORT_FIXED_COLUMNS.map((column) => ({
  ...column,
  header: normalizeHeader(column.label),
}));
const REQUIRED = FIXED.filter((column) => column.required);
const PARTICIPANT_PREFIXES = PROJECT_IMPORT_PARTICIPANT_COLUMNS.map(
  (column) => ({ ...column, prefix: normalizeHeader(column.label) }),
);
const TUTOR_PREFIX = normalizeHeader(PROJECT_IMPORT_TUTOR_COLUMN.label);

const STATES = new Map<string, ProjectState>([
  [normalizeHeader(PROJECT_IMPORT_STATE_APPROVED), ProjectState.APPROVED],
  [
    normalizeHeader(PROJECT_IMPORT_STATE_UNDER_REVIEW),
    ProjectState.UNDER_REVIEW,
  ],
]);

/** "<prefix> N" -> N ("correo tutor 2" with prefix "correo tutor" -> 2), or null */
const slotOf = (header: string, prefix: string): number | null => {
  if (!header.startsWith(`${prefix} `)) return null;
  const suffix = header.slice(prefix.length + 1);
  return /^\d+$/.test(suffix) ? Number(suffix) : null;
};

/**
 * Reads the "Proyectos" sheet of the project template: one row per project with up to 6
 * students and 2 tutors, each as a group of columns. Only converts the format: every business
 * rule (category, NRC, emails...) lives in project-service. A row with a format problem (a half
 * filled student, an unknown state) is not an error of the file: it carries `formatErrors`.
 */
export async function parseProjectImportSheet(
  buffer: Buffer,
): Promise<ProjectImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('El archivo no es un Excel .xlsx válido.');
  }
  const sheet = workbook.worksheets.find(
    (ws) => normalizeHeader(ws.name) === normalizeHeader(PROJECT_IMPORT_SHEET),
  );
  if (!sheet) {
    throw new BadRequestException(
      `No se encontró la hoja «${PROJECT_IMPORT_SHEET}».`,
    );
  }

  // The headers row is the first one (of the first rows) that has the required columns
  let headerRow = 0;
  const fixedColumns = new Map<FixedField, number>();
  for (
    let r = 1;
    r <= Math.min(PROJECT_IMPORT_HEADER_SEARCH_ROWS, sheet.rowCount) &&
    !headerRow;
    r++
  ) {
    const found = new Map<FixedField, number>();
    sheet.getRow(r).eachCell((cell, colNumber) => {
      const header = normalizeHeader(cellText(cell.value));
      const fixed = FIXED.find((c) => c.header === header);
      if (fixed && !found.has(fixed.field)) found.set(fixed.field, colNumber);
    });
    if (REQUIRED.every((c) => found.has(c.field))) {
      headerRow = r;
      found.forEach((col, field) => fixedColumns.set(field, col));
    }
  }
  if (!headerRow) {
    throw new BadRequestException(
      `Faltan columnas en la hoja «${PROJECT_IMPORT_SHEET}»: ${REQUIRED.map((c) => c.label).join(', ')}. Los encabezados deben estar en las primeras ${PROJECT_IMPORT_HEADER_SEARCH_ROWS} filas.`,
    );
  }

  const participantSlots = new Map<number, ParticipantColumns>();
  const tutorColumns = new Map<number, number>();
  sheet.getRow(headerRow).eachCell((cell, colNumber) => {
    const header = normalizeHeader(cellText(cell.value));
    const tutor = slotOf(header, TUTOR_PREFIX);
    if (tutor !== null) {
      if (tutor < 1 || tutor > PROJECT_IMPORT_MAX_TUTORS) return;
      if (tutorColumns.has(tutor)) {
        throw new BadRequestException(
          `La columna «${cell.text.trim()}» aparece más de una vez.`,
        );
      }
      tutorColumns.set(tutor, colNumber);
      return;
    }
    for (const { field, prefix } of PARTICIPANT_PREFIXES) {
      const slot = slotOf(header, prefix);
      if (slot === null) continue;
      if (slot < 1 || slot > PROJECT_IMPORT_MAX_PARTICIPANTS) return;
      const columns = participantSlots.get(slot) ?? {};
      if (columns[field]) {
        throw new BadRequestException(
          `La columna «${cell.text.trim()}» aparece más de una vez.`,
        );
      }
      columns[field] = colNumber;
      participantSlots.set(slot, columns);
      return;
    }
  });
  if (participantSlots.size === 0) {
    throw new BadRequestException(
      `Faltan las columnas de integrantes (${PARTICIPANT_PREFIXES.map((c) => `${c.label} N`).join(', ')}) en la hoja «${PROJECT_IMPORT_SHEET}».`,
    );
  }
  const orderedParticipants = [...participantSlots.entries()].sort(
    ([a], [b]) => a - b,
  );
  const orderedTutors = [...tutorColumns.entries()].sort(([a], [b]) => a - b);

  const rows: ProjectImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const text = (col: number | undefined) =>
      col ? cellText(row.getCell(col).value) : '';
    const fixed = (field: FixedField) => text(fixedColumns.get(field));
    const formatErrors: string[] = [];

    const participants: ProjectImportParticipant[] = [];
    for (const [slot, columns] of orderedParticipants) {
      const values = PARTICIPANT_PREFIXES.map(({ field, label }) => ({
        field,
        label,
        value: text(columns[field]),
      }));
      const filled = values.filter((v) => v.value);
      // A group with nothing written is an empty student slot, not an entry
      if (filled.length === 0) continue;
      const missing = values.filter((v) => !v.value);
      if (missing.length > 0) {
        formatErrors.push(
          `Integrante ${slot} incompleto: falta ${missing.map((v) => v.label.replace(' integrante', '')).join(', ')}.`,
        );
        continue;
      }
      participants.push({
        firstName: values[0].value,
        lastName: values[1].value,
        email: values[2].value,
        studentCode: values[3].value,
        semester: values[4].value,
        career: values[5].value,
      });
    }
    const tutorEmails = orderedTutors
      .map(([, column]) => text(column))
      .filter(Boolean);

    const stateText = fixed('state');
    let state = ProjectState.APPROVED;
    if (stateText) {
      const known = STATES.get(normalizeHeader(stateText));
      if (known === undefined) {
        formatErrors.push(
          `Estado «${stateText}» no válido: use «${PROJECT_IMPORT_STATE_APPROVED}» o «${PROJECT_IMPORT_STATE_UNDER_REVIEW}».`,
        );
      } else {
        state = known;
      }
    }

    const data = {
      categoryName: fixed('categoryName'),
      nrc: fixed('nrc'),
      name: fixed('name'),
      description: fixed('description'),
      projectCode: fixed('projectCode'),
    };
    const hasData =
      Object.values(data).some(Boolean) ||
      stateText !== '' ||
      participants.length > 0 ||
      tutorEmails.length > 0 ||
      formatErrors.length > 0;
    // A row with nothing written is blank space, not an entry
    if (!hasData) return;

    rows.push({
      rowNumber,
      ...data,
      state,
      participants,
      tutorEmails,
      formatErrors,
    });
  });

  if (rows.length === 0) {
    throw new BadRequestException('El archivo no tiene proyectos.');
  }
  if (rows.length > PROJECT_IMPORT_MAX_ROWS) {
    throw new BadRequestException(
      `El archivo tiene ${rows.length} proyectos; el máximo es ${PROJECT_IMPORT_MAX_ROWS}.`,
    );
  }
  return rows;
}
