import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  JurorImportRowResult,
  JurorImportTotals,
  PROJECTS_SERVICE_NAME,
  PreviewJurorImportResponse,
  ProjectsServiceClient,
} from '@app/common/generated/project';
import { parseJurorImportSheet } from './parse-juror-import-sheet';
import { buildJurorImportTemplate } from './build-juror-import-template';

/** One row of the preview as the front receives it */
export interface JurorImportPreviewRow {
  rowNumber: number;
  outcome: 'ASSIGN' | 'SKIP' | 'ERROR';
  userStatus?: 'NEW_USER' | 'EVENT_JUROR' | 'INVITE_TO_EVENT';
  message: string;
  email: string;
  projectId?: number;
  projectName?: string;
  userId?: number;
}

export interface JurorImportPreview {
  rows: JurorImportPreviewRow[];
  totals: JurorImportTotals;
  eventWarnings: string[];
  canConfirm: boolean;
}

const UNSET_USER_STATUS = 'JUROR_IMPORT_USER_STATUS_UNSPECIFIED';

/**
 * The project client loads enums as strings, fills defaults and adds a virtual
 * "_field" key for every optional field: keep only the fields of the contract.
 */
const toPreviewRow = (row: JurorImportRowResult): JurorImportPreviewRow => {
  const userStatus = String(row.userStatus);
  return {
    rowNumber: row.rowNumber,
    outcome: String(row.outcome) as JurorImportPreviewRow['outcome'],
    ...(row.userStatus && userStatus !== UNSET_USER_STATUS
      ? { userStatus: userStatus as JurorImportPreviewRow['userStatus'] }
      : {}),
    message: row.message,
    email: row.email,
    ...(row.projectId != null ? { projectId: row.projectId } : {}),
    ...(row.projectName != null ? { projectName: row.projectName } : {}),
    ...(row.userId != null ? { userId: row.userId } : {}),
  };
};

@Injectable()
export class JurorImportsService implements OnModuleInit {
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
  ): Promise<JurorImportPreview> {
    if (!file) {
      throw new BadRequestException(
        'Adjunte la plantilla .xlsx en el campo «file».',
      );
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('El archivo debe ser .xlsx.');
    }
    const rows = await parseJurorImportSheet(file.buffer);
    const res: PreviewJurorImportResponse = await firstValueFrom(
      this.projectsService.previewJurorImport({ eventId, rows }),
    );
    return {
      rows: (res.rows ?? []).map(toPreviewRow),
      totals: res.totals as JurorImportTotals,
      eventWarnings: res.eventWarnings ?? [],
      canConfirm: res.canConfirm,
    };
  }

  /** Builds the template of the event with its approved projects */
  async template(eventId: number): Promise<{ fileName: string; file: Buffer }> {
    const data = await firstValueFrom(
      this.projectsService.getJurorImportTemplate({ eventId }),
    );
    const projects = (data.projects ?? []).map((project) => ({
      projectId: project.projectId,
      department: project.department ?? '',
      projectCode: project.projectCode ?? '',
      name: project.name ?? '',
      members: project.members ?? [],
      // IRIS does not store the tutor yet: the column goes out empty
      tutors: [],
    }));
    const file = await buildJurorImportTemplate({
      eventName: data.eventName ?? '',
      projects,
    });
    return { fileName: `plantilla-jurados-evento-${eventId}.xlsx`, file };
  }
}
