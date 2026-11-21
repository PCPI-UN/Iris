import { ConflictError } from './errors';

/** Why an administrative state change needs force. */
export interface ProjectStateChangeBlock {
  hasEvaluations: boolean;
  evaluationCount: number;
  resultsPublished: boolean;
  /** The project is APPROVED and the change takes it out of the ranking and the juror import */
  leavesApproved: boolean;
  /** Spanish message for the user */
  message: string;
}

/**
 * Builds the block of a state change: the project has juror evaluations or its event has
 * published results. Returns null when neither is true.
 */
export function stateChangeBlock(input: {
  evaluationCount: number;
  resultsPublished: boolean;
  leavesApproved: boolean;
}): ProjectStateChangeBlock | null {
  const hasEvaluations = input.evaluationCount > 0;
  if (!hasEvaluations && !input.resultsPublished) return null;

  const causes: string[] = [];
  if (hasEvaluations) {
    causes.push(
      input.evaluationCount === 1
        ? 'el proyecto ya tiene 1 evaluación de jurados'
        : `el proyecto ya tiene ${input.evaluationCount} evaluaciones de jurados`,
    );
  }
  if (input.resultsPublished)
    causes.push('el evento ya publicó sus resultados');

  let message = `No se cambió el estado porque ${causes.join(' y ')}.`;
  if (input.leavesApproved) {
    message +=
      ' Si el proyecto deja de estar aprobado, sale del ranking y de la plantilla e importación de jurados; sus evaluaciones se conservan.';
  }
  message += ' Confirma el cambio para aplicarlo de todas formas.';

  return {
    hasEvaluations,
    evaluationCount: input.evaluationCount,
    resultsPublished: input.resultsPublished,
    leavesApproved: input.leavesApproved,
    message,
  };
}

/** The state change was not applied because it needs force; carries the cause. */
export class ProjectStateChangeBlockedError extends ConflictError {
  constructor(readonly block: ProjectStateChangeBlock) {
    super(block.message);
  }
}
