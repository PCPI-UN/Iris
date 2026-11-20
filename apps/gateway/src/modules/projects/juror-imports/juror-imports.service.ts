import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import {
  ExecuteJurorImportResponse,
  JurorImportExecutionTotals,
  JurorImportFailedInvitation,
  JurorImportRow,
  JurorImportRowResult,
  JurorImportTotals,
  PROJECTS_SERVICE_NAME,
  PreviewJurorImportResponse,
  ProjectsServiceClient,
} from '@app/common/generated/project';
import {
  EVENT_SERVICE_NAME,
  EventServiceClient,
} from '@app/common/generated/event';
import { InvitationsService } from '../../invitations/invitations.service';
import { parseJurorImportSheet } from './parse-juror-import-sheet';
import { buildJurorImportTemplate } from './build-juror-import-template';

/** One row of the preview as the front receives it */
export interface JurorImportPreviewRow {
  rowNumber: number;
  /** N of "jurado N" in the row, starting at 1 */
  jurorSlot: number;
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

/** Summary of an executed juror import */
export interface JurorImportExecutionResult {
  /** ASSIGN: assigned now, SKIP: already assigned, ERROR: not assigned */
  rows: JurorImportPreviewRow[];
  totals: JurorImportExecutionTotals & {
    /** Jurors invited to the event, new accounts included */
    invitationsSent: number;
    /** Invited jurors who had no account: it was created with the invitation */
    newUsers: number;
  };
}

const UNSET_USER_STATUS = 'JUROR_IMPORT_USER_STATUS_UNSPECIFIED';
const INVITATION_CONCURRENCY = 5;

interface JurorToInvite {
  email: string;
  firstName: string;
  lastName?: string;
  isNewUser: boolean;
}

/** The message of a failed gRPC call: RpcException, gRPC error or plain Error */
const grpcErrorMessage = (error: unknown): string => {
  const e = error as {
    details?: string;
    message?: string;
    getError?: () => unknown;
  };
  const rpc = e?.getError?.() as { message?: string } | string | undefined;
  return (
    (typeof rpc === 'string' ? rpc : rpc?.message) ||
    e?.details ||
    e?.message ||
    'error inesperado'
  );
};

async function forEachWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

/**
 * The project client loads enums as strings, fills defaults and adds a virtual
 * "_field" key for every optional field: keep only the fields of the contract.
 */
const toPreviewRow = (row: JurorImportRowResult): JurorImportPreviewRow => {
  const userStatus = String(row.userStatus);
  return {
    rowNumber: row.rowNumber,
    jurorSlot: row.jurorSlot,
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
  private eventsService: EventServiceClient;

  constructor(
    @Inject(PROJECTS_SERVICE_NAME) private readonly projectsClient: ClientGrpc,
    @Inject(EVENT_SERVICE_NAME) private readonly eventsClient: ClientGrpc,
    private readonly invitations: InvitationsService,
  ) {}

  onModuleInit() {
    this.projectsService =
      this.projectsClient.getService<ProjectsServiceClient>(
        PROJECTS_SERVICE_NAME,
      );
    this.eventsService =
      this.eventsClient.getService<EventServiceClient>(EVENT_SERVICE_NAME);
  }

  /** Reads the uploaded template and asks project-service what confirming would do */
  async preview(
    eventId: number,
    file: Express.Multer.File | undefined,
  ): Promise<JurorImportPreview> {
    const rows = await this.readRows(file);
    return this.requestPreview(eventId, rows);
  }

  /**
   * Executes the import of the same file reviewed in the preview: validates it again, invites to
   * the event the jurors who are not in it yet (creating the account of new ones) and assigns every
   * juror to their project. A file that cannot be confirmed assigns nothing and is answered with
   * its preview. A juror whose invitation fails is reported as an error and not assigned; the rest
   * are assigned anyway.
   */
  async execute(
    eventId: number,
    file: Express.Multer.File | undefined,
    invitedByUserId: number,
  ): Promise<JurorImportExecutionResult> {
    const rows = await this.readRows(file);
    const preview = await this.requestPreview(eventId, rows);
    if (!preview.canConfirm) {
      throw new BadRequestException({
        message:
          'No se puede ejecutar la asignación: la carga tiene errores o avisos. Revise la vista previa.',
        preview,
      });
    }

    const jurors = this.jurorsToInvite(preview, rows);
    const failedInvitations: JurorImportFailedInvitation[] = [];
    if (jurors.length) {
      const eventType = await this.eventType(eventId);
      await forEachWithConcurrency(
        jurors,
        INVITATION_CONCURRENCY,
        async (juror) => {
          try {
            await this.invitations.inviteJurorToEvent(
              eventId,
              {
                email: juror.email,
                firstName: juror.firstName,
                lastName: juror.lastName,
                eventType,
              },
              invitedByUserId,
            );
          } catch (error) {
            failedInvitations.push({
              email: juror.email,
              message: grpcErrorMessage(error),
            });
          }
        },
      );
    }

    const res: ExecuteJurorImportResponse = await firstValueFrom(
      this.projectsService.executeJurorImport({
        eventId,
        rows,
        failedInvitations,
      }),
    );

    const failed = new Set(failedInvitations.map((f) => f.email));
    const invited = jurors.filter((j) => !failed.has(j.email));
    // Once invited a new juror has an account: still tell the front it was created now
    const newUsers = new Set(
      invited.filter((j) => j.isNewUser).map((j) => j.email),
    );
    return {
      rows: (res.rows ?? [])
        .map(toPreviewRow)
        .map((row) =>
          newUsers.has(row.email) && row.userStatus
            ? { ...row, userStatus: 'NEW_USER' as const }
            : row,
        ),
      totals: {
        ...(res.totals as JurorImportExecutionTotals),
        invitationsSent: invited.length,
        newUsers: newUsers.size,
      },
    };
  }

  /** Checks the upload and reads the rows of the juror sheet */
  private async readRows(
    file: Express.Multer.File | undefined,
  ): Promise<JurorImportRow[]> {
    if (!file) {
      throw new BadRequestException(
        'Adjunte la plantilla .xlsx en el campo «file».',
      );
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('El archivo debe ser .xlsx.');
    }
    return parseJurorImportSheet(file.buffer);
  }

  private async requestPreview(
    eventId: number,
    rows: JurorImportRow[],
  ): Promise<JurorImportPreview> {
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

  /** Jurors to assign who are not in the event yet, once each, with the name of their first row */
  private jurorsToInvite(
    preview: JurorImportPreview,
    rows: JurorImportRow[],
  ): JurorToInvite[] {
    const sourceRows = new Map(
      rows.map((row) => [`${row.rowNumber}|${row.jurorSlot}`, row]),
    );
    const jurors = new Map<string, JurorToInvite>();
    for (const row of preview.rows) {
      if (row.outcome !== 'ASSIGN' || jurors.has(row.email)) continue;
      if (
        row.userStatus !== 'NEW_USER' &&
        row.userStatus !== 'INVITE_TO_EVENT'
      ) {
        continue;
      }
      const source = sourceRows.get(`${row.rowNumber}|${row.jurorSlot}`);
      const lastName = source?.lastName?.trim();
      jurors.set(row.email, {
        email: row.email,
        firstName: source?.firstName?.trim() || row.email.split('@')[0],
        ...(lastName ? { lastName } : {}),
        isNewUser: row.userStatus === 'NEW_USER',
      });
    }
    return [...jurors.values()];
  }

  /** The invitation expects the event type as the API names it */
  private async eventType(eventId: number): Promise<string> {
    const res = await firstValueFrom(
      this.eventsService.getEvent({ id: eventId }),
    );
    return String(res.event?.eventType) === 'COMPETENCIA'
      ? 'Competition'
      : 'Exposition';
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
      tutors: project.tutors ?? [],
      tutorEmails: project.tutorEmails ?? [],
    }));
    const file = await buildJurorImportTemplate({
      eventName: data.eventName ?? '',
      projects,
    });
    return { fileName: `plantilla-jurados-evento-${eventId}.xlsx`, file };
  }
}
