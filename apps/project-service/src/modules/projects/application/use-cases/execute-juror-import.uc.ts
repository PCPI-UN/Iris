import { Inject, Injectable } from '@nestjs/common';
import { normalizeEmail } from '@app/common/utils/email.util';
import { ProjectRepository } from '../../domain/repositories/project.repository';
import { JUROR_ROLE_ID } from '../../domain/entities/project.entity';
import { PreconditionError } from '../../domain/errors';
import {
  JUROR_IMPORT_TUTOR_NOTE,
  JurorImportPreview,
  JurorImportRowInput,
  JurorImportRowResult,
  PreviewJurorImportUC,
} from './preview-juror-import.uc';

export interface JurorImportFailedInvitation {
  email: string;
  /** In Spanish, why the invitation could not be sent */
  message: string;
}

export interface JurorImportExecutionTotals {
  rows: number;
  assigned: number;
  skipped: number;
  errors: number;
  /** Distinct jurors in assigned rows */
  jurors: number;
}

export interface JurorImportExecution {
  /** ASSIGN: assigned now, SKIP: already assigned, ERROR: not assigned */
  rows: JurorImportRowResult[];
  totals: JurorImportExecutionTotals;
}

/** Why a preview cannot be confirmed, for the person who uploaded the file */
const refusalReason = (preview: JurorImportPreview): string => {
  if (preview.eventWarnings.length) return preview.eventWarnings.join(' ');
  if (preview.totals.errors > 0) {
    return preview.totals.errors === 1
      ? 'Hay 1 jurado con error; corríjalo y vuelva a cargar el archivo.'
      : `Hay ${preview.totals.errors} jurados con error; corríjalos y vuelva a cargar el archivo.`;
  }
  return 'No hay jurados por asignar: todos ya estaban asignados.';
};

/**
 * Assigns the jurors of a juror import the person already reviewed in the preview.
 * The rows are validated again, so a file with errors, or one that changed, is never applied.
 * Every assignment is written in one statement and existing ones are skipped: no duplicates.
 * The invitations are sent by the gateway before this call; rows of jurors whose invitation
 * failed are reported as errors and not assigned.
 */
@Injectable()
export class ExecuteJurorImportUC {
  constructor(
    @Inject('ProjectRepository') private readonly repo: ProjectRepository,
    private readonly preview: PreviewJurorImportUC,
  ) {}

  async execute(input: {
    eventId: number;
    rows: JurorImportRowInput[];
    failedInvitations?: JurorImportFailedInvitation[];
  }): Promise<JurorImportExecution> {
    const { eventId, rows, failedInvitations = [] } = input;
    const preview = await this.preview.execute({ eventId, rows });
    if (!preview.canConfirm) {
      throw new PreconditionError(
        `No se puede ejecutar la asignación. ${refusalReason(preview)}`,
      );
    }

    const failed = new Map(
      failedInvitations.map((f) => [normalizeEmail(f.email), f.message]),
    );
    const results = preview.rows.map((row) => this.result(row, failed));
    const toAssign = results.filter((r) => r.outcome === 'ASSIGN');

    await this.repo.createAssignments(
      toAssign.map((r) => ({
        projectId: r.projectId!,
        juror: {
          memberUserId: r.userId!,
          memberEventId: eventId,
          memberRoleId: JUROR_ROLE_ID,
        },
      })),
    );

    return {
      rows: results,
      totals: {
        rows: results.length,
        assigned: toAssign.length,
        skipped: results.filter((r) => r.outcome === 'SKIP').length,
        errors: results.filter((r) => r.outcome === 'ERROR').length,
        jurors: new Set(toAssign.map((r) => r.userId)).size,
      },
    };
  }

  /** The preview row with the message of what was done */
  private result(
    row: JurorImportRowResult,
    failed: Map<string, string>,
  ): JurorImportRowResult {
    if (row.outcome !== 'ASSIGN') return row;
    // A juror who joined the event meanwhile (e.g. accepted an earlier invitation) needs no invitation
    const failure =
      row.userStatus === 'EVENT_JUROR' ? undefined : failed.get(row.email);
    if (failure !== undefined) {
      return {
        ...row,
        outcome: 'ERROR',
        message: `No se asignó: no se pudo enviar la invitación al evento (${failure}).`,
      };
    }
    // The gateway invites new jurors first, so by now every juror has an account
    if (row.userId == null || row.projectId == null) {
      return {
        ...row,
        outcome: 'ERROR',
        message: 'No se asignó: el jurado no tiene cuenta en IRIS.',
      };
    }
    const tutorNote = row.message.endsWith(JUROR_IMPORT_TUTOR_NOTE)
      ? JUROR_IMPORT_TUTOR_NOTE
      : '';
    return {
      ...row,
      message:
        (row.userStatus === 'EVENT_JUROR'
          ? 'Asignado.'
          : 'Asignado. Debe aceptar la invitación al evento para evaluar.') +
        tutorNote,
    };
  }
}
