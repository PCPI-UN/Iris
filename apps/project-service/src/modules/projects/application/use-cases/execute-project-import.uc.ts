import { Injectable, Logger } from '@nestjs/common';
import { DomainError, PreconditionError } from '../../domain/errors';
import {
  AdminCreateProjectResult,
  AdminCreateProjectUC,
} from './admin-create-project.uc';
import {
  participantsSummary,
  PreviewProjectImportUC,
  ProjectImportCreatePlan,
  ProjectImportPreview,
  ProjectImportRowInput,
  ProjectImportRowResult,
} from './preview-project-import.uc';

export interface ProjectImportExecutionTotals {
  rows: number;
  created: number;
  skipped: number;
  errors: number;
  /** Approval emails sent to pending students (INVITED) */
  emailsSent: number;
  /** Created rows with some failed effect */
  failedEffects: number;
}

export interface ProjectImportExecution {
  /** CREATED: created now, SKIP: already in the event, ERROR: not created */
  rows: ProjectImportRowResult[];
  totals: ProjectImportExecutionTotals;
}

/** Why a preview cannot be confirmed, for the person who uploaded the file */
const refusalReason = (preview: ProjectImportPreview): string => {
  if (preview.eventWarnings.length) return preview.eventWarnings.join(' ');
  if (preview.totals.errors > 0) {
    return preview.totals.errors === 1
      ? 'Hay 1 proyecto con error; corríjalo y vuelva a cargar el archivo.'
      : `Hay ${preview.totals.errors} proyectos con error; corríjalos y vuelva a cargar el archivo.`;
  }
  return 'No hay proyectos por crear: todos ya existen en el evento.';
};

const stackOf = (error: unknown) =>
  error instanceof Error ? error.stack : String(error);

/**
 * Creates the projects of a project import the person already reviewed in the preview. The
 * rows are validated again, so a file with errors, or one that changed, is never applied.
 *
 * Each CREATE row is created with AdminCreateProjectUC, in file order and one after the other
 * (the student locks serialize them anyway), each in its own transaction. A row rejected at
 * creation (for example, a student another administrator added meanwhile) is reported as an
 * ERROR with its cause and the next rows go on.
 */
@Injectable()
export class ExecuteProjectImportUC {
  private readonly logger = new Logger(ExecuteProjectImportUC.name);

  constructor(
    private readonly preview: PreviewProjectImportUC,
    private readonly adminCreateProject: AdminCreateProjectUC,
  ) {}

  async execute(input: {
    eventId: number;
    rows: ProjectImportRowInput[];
    actingUserId: number;
    fileName: string;
  }): Promise<ProjectImportExecution> {
    const { eventId, rows, actingUserId, fileName } = input;
    const { preview, plans } = await this.preview.evaluate({ eventId, rows });
    if (!preview.canConfirm) {
      throw new PreconditionError(
        `No se puede ejecutar la importación. ${refusalReason(preview)}`,
      );
    }

    const results: ProjectImportRowResult[] = [];
    let emailsSent = 0;
    for (const [index, row] of preview.rows.entries()) {
      const plan = plans[index];
      if (row.outcome !== 'CREATE' || !plan) {
        results.push(row);
        continue;
      }
      const created = await this.create(eventId, rows[index], plan, {
        actingUserId,
        fileName,
      });
      if ('error' in created) {
        results.push({
          ...row,
          outcome: 'ERROR',
          message: `No se creó: ${created.error}`,
        });
        continue;
      }
      const { result } = created;
      emailsSent += result.participants.filter(
        (p) => p.status === 'INVITED',
      ).length;
      const participants = result.participants.map((p) => ({
        email: p.email,
        status:
          p.status === 'JOINED'
            ? ('HAS_ACCOUNT' as const)
            : ('NO_ACCOUNT' as const),
      }));
      results.push({
        ...row,
        outcome: 'CREATED',
        projectId: result.project.id,
        participants,
        failedEffects: result.failedEffects,
        message:
          `Creado con ${participantsSummary(participants)}.` +
          (result.warning ? ` ${result.warning}` : ''),
      });
    }

    return {
      rows: results,
      totals: {
        rows: results.length,
        created: results.filter((r) => r.outcome === 'CREATED').length,
        skipped: results.filter((r) => r.outcome === 'SKIP').length,
        errors: results.filter((r) => r.outcome === 'ERROR').length,
        emailsSent,
        failedEffects: results.filter((r) => r.failedEffects?.length).length,
      },
    };
  }

  /** The created project, or the cause (in Spanish) why it was not created */
  private async create(
    eventId: number,
    row: ProjectImportRowInput,
    plan: ProjectImportCreatePlan,
    by: { actingUserId: number; fileName: string },
  ): Promise<{ result: AdminCreateProjectResult } | { error: string }> {
    const optional = (value?: string) => value?.trim() || undefined;
    try {
      const result = await this.adminCreateProject.execute({
        eventId,
        courseId: plan.courseId,
        name: row.name.trim(),
        description: optional(row.description),
        projectCode: optional(row.projectCode),
        nrc: optional(row.nrc),
        state: plan.state,
        participants: row.participants,
        tutorUserIds: plan.tutorUserIds,
        pendingTutors: [],
        actingUserId: by.actingUserId,
        origin: {
          kind: 'ADMIN_BULK',
          fileName: by.fileName,
          rowNumber: row.rowNumber,
        },
      });
      return { result };
    } catch (error) {
      if (error instanceof DomainError) return { error: error.message };
      this.logger.error(
        `Row ${row.rowNumber} of the project import of event ${eventId} failed`,
        stackOf(error),
      );
      return { error: 'falló inesperadamente; vuelva a intentarlo.' };
    }
  }
}
