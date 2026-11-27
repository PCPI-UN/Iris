import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  PROJECTS_SERVICE_NAME,
  ProjectImportExecutionTotals,
  ProjectImportRow,
  ProjectImportRowResult,
  ProjectImportTotals,
  ProjectsServiceClient,
} from '@app/common/generated/project';
import { decodeOriginalName } from '@app/common/utils/file-name.util';
import { fileNamePart } from '../../../common/excel/xlsx-file';
import { parseProjectImportSheet } from './parse-project-import-sheet';
import { buildProjectImportTemplate } from './build-project-import-template';

type PreviewOutcome = 'CREATE' | 'SKIP' | 'ERROR';
type ExecutionOutcome = 'CREATED' | 'SKIP' | 'ERROR';

/** One row of the preview as the front receives it */
export interface ProjectImportPreviewRow<O extends string = PreviewOutcome> {
  /** Spreadsheet row, 1-based as the user sees it */
  rowNumber: number;
  outcome: O;
  /** In Spanish, for the person who uploaded the file */
  message: string;
  projectName: string;
  categoryName?: string;
  state: 'APPROVED' | 'UNDER_REVIEW';
  participants: { email: string; status: 'HAS_ACCOUNT' | 'NO_ACCOUNT' }[];
  /** SKIP: the existing project; CREATED: the new one */
  projectId?: number;
}

export interface ProjectImportPreview {
  rows: ProjectImportPreviewRow[];
  totals: ProjectImportTotals;
  eventWarnings: string[];
  canConfirm: boolean;
}

/** Summary of an executed project import */
export interface ProjectImportResult {
  rows: (ProjectImportPreviewRow<ExecutionOutcome> & {
    /** Work in other services that failed after the project was saved */
    failedEffects?: string[];
  })[];
  totals: Omit<ProjectImportExecutionTotals, 'rows'>;
}

/** The project client loads enums as strings: "PROJECT_IMPORT_CREATE" -> "CREATE" */
const withoutPrefix = (value: unknown): string =>
  String(value).replace(/^PROJECT_IMPORT_/, '');

/**
 * The project client loads enums as strings, fills defaults and adds a virtual "_field" key for
 * every optional field: keep only the fields of the contract.
 */
const toRow = <O extends string>(
  row: ProjectImportRowResult,
): ProjectImportPreviewRow<O> => ({
  rowNumber: row.rowNumber,
  outcome: withoutPrefix(row.outcome) as O,
  message: row.message,
  projectName: row.projectName,
  ...(row.categoryName != null ? { categoryName: row.categoryName } : {}),
  state: String(row.state) === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : 'APPROVED',
  participants: (row.participants ?? []).map((participant) => ({
    email: participant.email,
    status: withoutPrefix(participant.status) as 'HAS_ACCOUNT' | 'NO_ACCOUNT',
  })),
  ...(row.projectId != null ? { projectId: row.projectId } : {}),
});

@Injectable()
export class ProjectImportsService implements OnModuleInit {
  private projectsService: ProjectsServiceClient;

  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectsClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.projectsService =
      this.projectsClient.getService<ProjectsServiceClient>(
        PROJECTS_SERVICE_NAME,
      );
  }

  /** Reads the uploaded template and asks project-service what confirming would do */
  async preview(
    eventId: number,
    file: Express.Multer.File | undefined,
  ): Promise<ProjectImportPreview> {
    const rows = await this.readRows(file);
    return this.requestPreview(eventId, rows);
  }

  /**
   * Executes the import of the same file reviewed in the preview: validates it again and, when it
   * can be confirmed, project-service creates the projects row by row. A file that cannot be
   * confirmed creates nothing and is answered with its preview. Projects already in the event are
   * skipped, so running the same file twice duplicates nothing.
   */
  async execute(
    eventId: number,
    file: Express.Multer.File | undefined,
    actingUserId: number,
  ): Promise<ProjectImportResult> {
    const rows = await this.readRows(file);
    const preview = await this.requestPreview(eventId, rows);
    if (!preview.canConfirm) {
      throw new BadRequestException({
        message:
          'No se puede ejecutar la carga: tiene errores o avisos. Revise la vista previa.',
        // The exception filter passes only `code` and `details` on to the answer
        details: { preview },
      });
    }

    const res = await firstValueFrom(
      this.projectsService.executeProjectImport({
        eventId,
        rows,
        actingUserId,
        fileName: decodeOriginalName(file!.originalname),
      }),
    );
    const totals = res.totals as ProjectImportExecutionTotals;
    return {
      rows: (res.rows ?? []).map((row) => {
        const failedEffects = row.failedEffects ?? [];
        return {
          ...toRow<ExecutionOutcome>(row),
          ...(failedEffects.length ? { failedEffects } : {}),
        };
      }),
      totals: {
        created: totals.created,
        skipped: totals.skipped,
        errors: totals.errors,
        emailsSent: totals.emailsSent,
        failedEffects: totals.failedEffects,
      },
    };
  }

  /** Builds the template of the event with its categories */
  async template(eventId: number): Promise<{ fileName: string; file: Buffer }> {
    const data = await firstValueFrom(
      this.projectsService.getProjectImportTemplate({ eventId }),
    );
    const eventName = data.eventName ?? '';
    const file = await buildProjectImportTemplate({
      eventName,
      categoryNames: data.categoryNames ?? [],
      requiresCourse: Boolean(data.requiresCourse),
    });
    return {
      fileName: `plantilla-proyectos-${fileNamePart(eventName)}.xlsx`,
      file,
    };
  }

  /** Checks the upload and reads the rows of the projects sheet */
  private async readRows(
    file: Express.Multer.File | undefined,
  ): Promise<ProjectImportRow[]> {
    if (!file) {
      throw new BadRequestException(
        'Adjunte la plantilla .xlsx en el campo «file».',
      );
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('El archivo debe ser .xlsx.');
    }
    return parseProjectImportSheet(file.buffer);
  }

  private async requestPreview(
    eventId: number,
    rows: ProjectImportRow[],
  ): Promise<ProjectImportPreview> {
    const res = await firstValueFrom(
      this.projectsService.previewProjectImport({ eventId, rows }),
    );
    return {
      rows: (res.rows ?? []).map((row) => toRow<PreviewOutcome>(row)),
      totals: res.totals as ProjectImportTotals,
      eventWarnings: res.eventWarnings ?? [],
      canConfirm: res.canConfirm,
    };
  }
}
