import { ConflictError } from './errors';

/**
 * Why an administrative edit of the basic data or the category changed nothing:
 * - PROJECT_NAME_TAKEN: another project of the same event has that name
 * - PROJECT_CATEGORY_CHANGE_BLOCKED: the project has juror evaluations, whose rubrics depend on
 *   the category; it is applied with force
 * - PROJECT_CHANGED_MEANWHILE: another edit changed the same fields after they were read
 */
export type AdminProjectEditConflictCode =
  | 'PROJECT_NAME_TAKEN'
  | 'PROJECT_CATEGORY_CHANGE_BLOCKED'
  | 'PROJECT_CHANGED_MEANWHILE';

export interface AdminProjectEditConflict {
  code: AdminProjectEditConflictCode;
  /** Spanish message for the user */
  message: string;
  /** PROJECT_CATEGORY_CHANGE_BLOCKED: juror evaluations of the project */
  evaluationCount?: number;
  /** PROJECT_NAME_TAKEN: the name that is taken */
  name?: string;
}

/** The edit was not applied; carries the cause so the client can tell them apart. */
export class AdminProjectEditConflictError extends ConflictError {
  constructor(readonly conflict: AdminProjectEditConflict) {
    super(conflict.message);
  }
}

/** Another project of the event already has the name (also thrown by the repository on the unique index). */
export class ProjectNameTakenError extends AdminProjectEditConflictError {
  constructor(name: string) {
    super({
      code: 'PROJECT_NAME_TAKEN',
      name,
      message: `Ya existe otro proyecto con el nombre "${name}" en este evento. Usa un nombre distinto.`,
    });
  }
}

/** The category change needs force because the project has juror evaluations. */
export function categoryChangeBlocked(
  evaluationCount: number,
): AdminProjectEditConflictError {
  const evaluations =
    evaluationCount === 1
      ? '1 evaluación de jurados, calificada'
      : `${evaluationCount} evaluaciones de jurados, calificadas`;
  return new AdminProjectEditConflictError({
    code: 'PROJECT_CATEGORY_CHANGE_BLOCKED',
    evaluationCount,
    message:
      `No se cambió la categoría porque el proyecto ya tiene ${evaluations} ` +
      'con las rúbricas de la categoría actual. Confirma el cambio para aplicarlo de todas formas.',
  });
}

/** Another edit changed the same fields after they were read; nothing was written. */
export class ProjectChangedMeanwhileError extends AdminProjectEditConflictError {
  constructor() {
    super({
      code: 'PROJECT_CHANGED_MEANWHILE',
      message:
        'Otro cambio modificó el proyecto mientras se aplicaba la edición. Vuelve a cargar el proyecto e inténtalo de nuevo.',
    });
  }
}

/** Basic data of a project, as the change log stores it (INFO entries). */
export interface ProjectBasicData {
  name: string;
  description: string | null;
  projectCode: string | null;
  eventNumber: string | null;
}

/**
 * Normalizes an optional text field of the edit: undefined keeps the current value, and an
 * empty or blank text clears it (null). Other values are trimmed.
 */
export const optionalText = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};
