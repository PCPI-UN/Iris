import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import * as ExcelJS from 'exceljs';
import { CreateEventDTO } from './dto/events/create-event.dto';
import { DeleteEventDTO } from './dto/events/delete-event.dto';
import { GetEventDTO } from './dto/events/get-event.dto';
import { ListEventsDTO } from './dto/events/list-events.dto';
import { ListMyEventsDTO } from './dto/events/list-my-events.dto';
import { UpdateEventDTO } from './dto/events/update-event.dto';
import { CreateEventMemberDTO } from './dto/event-members/create-event-member.dto';
import { DeleteEventMemberDTO } from './dto/event-members/delete-event-member.dto';
import { ListEventMembersDTO } from './dto/event-members/list-event-members.dto';
import { CreateCourseDTO } from './dto/courses/create-course.dto';
import { ListCoursesByEventDTO } from './dto/courses/list-courses-by-event.dto';
import { ListCoursesDTO } from './dto/courses/list-course.dto';
import { ListCoursesForDropdownDTO } from './dto/courses/list-courses-for-dropdown.dto';
import { UpdateCourseDTO } from './dto/courses/update-course.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectStateFilter } from '../projects/dto/list-projects-by-event.dto';
import {
  CreateAwardWinnerDTO,
  CreateCategoryAwardDTO,
  CreateCategoryDTO,
  CreateEventInscriptionDetailDTO,
  CreateEventRecapDTO,
  ListAwardWinnersDTO,
  ListCategoriesDTO,
  ListCategoryAwardsDTO,
  ListEventInscriptionDetailsDTO,
  ListEventRecapsDTO,
  UpdateAwardWinnerDTO,
  UpdateCategoryAwardDTO,
  UpdateCategoryDTO,
  UpdateEventInscriptionDetailDTO,
  UpdateEventRecapDTO,
} from './dto/event-catalog.dto';
import {
  EVENT_SERVICE_NAME,
  EventServiceClient,
} from '@app/common/generated/event';
import {
  AUTH_SERVICE_NAME,
  AuthServiceClient,
} from '@app/common/generated/auth';
import { ListConfirmedJurorsByEventUseCase } from './use-cases/list-confirmed-jurors-by-event.use-case';
import { ListConfirmedJurorsByEventResponse } from './types/confirmed-jurors.types';
import {
  CreateEventRequest,
  CreateEventResponse,
  DeleteEventRequest,
  DeleteEventResponse,
  GetEventRequest,
  GetEventResponse,
  UpdateEventRequest,
  UpdateEventResponse,
  CreateEventMemberRequest,
  CreateEventMemberResponse,
  DeleteEventMemberRequest,
  DeleteEventMemberResponse,
  ListEventMembersRequest,
  ListEventMembersResponse,
  ListMyEventsRequest,
  ListMyEventsResponse,
  ListEventsRequest,
  ListEventsResponse,
  GetEventStatusesRequest,
  GetEventStatusesResponse,
  EventStatusMapping,
  EventProto,
  EventWithRole,
  CreateCategoryRequest,
  CreateCategoryResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  GetCategoryRequest,
  GetCategoryResponse,
  ListCategoriesRequest,
  ListCategoriesResponse,
  ListCategoriesByEventRequest,
  DeleteCategoryRequest,
  DeleteCategoryResponse,
  CreateCourseResponse,
  DeleteCourseResponse,
  CreateCategoryAwardRequest,
  CreateCategoryAwardResponse,
  GetCourseResponse,
  UpdateCategoryAwardRequest,
  UpdateCategoryAwardResponse,
  ListCoursesForDropdownResponse,
  ListCoursesResponse,
  GetCategoryAwardRequest,
  GetCategoryAwardResponse,
  ListCategoryAwardsRequest,
  ListCategoryAwardsResponse,
  DeleteCategoryAwardRequest,
  DeleteCategoryAwardResponse,
  UpdateCourseResponse,
  CreateAwardWinnerRequest,
  CreateAwardWinnerResponse,
  UpdateAwardWinnerRequest,
  UpdateAwardWinnerResponse,
  GetAwardWinnerRequest,
  GetAwardWinnerResponse,
  ListAwardWinnersRequest,
  ListAwardWinnersResponse,
  ListAwardsByProjectsResponse,
  DeleteAwardWinnerRequest,
  DeleteAwardWinnerResponse,
  CreateEventInscriptionDetailRequest,
  CreateEventInscriptionDetailResponse,
  UpdateEventInscriptionDetailRequest,
  UpdateEventInscriptionDetailResponse,
  GetEventInscriptionDetailRequest,
  GetEventInscriptionDetailResponse,
  ListEventInscriptionDetailsRequest,
  ListEventInscriptionDetailsResponse,
  DeleteEventInscriptionDetailRequest,
  DeleteEventInscriptionDetailResponse,
  CreateEventRecapRequest,
  CreateEventRecapResponse,
  UpdateEventRecapRequest,
  UpdateEventRecapResponse,
  GetEventRecapRequest,
  GetEventRecapResponse,
  ListEventRecapsRequest,
  ListEventRecapsResponse,
  DeleteEventRecapRequest,
  DeleteEventRecapResponse,
  CreateRankingEventRequest,
  UpdateRankingEventRequest,
  GetRankingEventRequest,
  GetRankingEventByEventIdRequest,
  DeleteRankingEventRequest,
  RankingEventResponse,
  DeleteRankingEventResponse,
  GetEventsForARRequest,
  GetEventsForARResponse,
} from '@app/common/generated/event';
import { CreateRankingEventDTO } from './dto/ranking-event/create-ranking-event.dto';
import { UpdateRankingEventDTO } from './dto/ranking-event/update-ranking-event.dto';
import {
  EVALUATION_SERVICE_NAME,
  EvaluationServiceClient,
} from '@app/common/generated/evaluation';
import { ProjectComplete } from '@app/common/generated/project';
import {
  GetRankingReportDto,
  RankingReportFormat,
} from './dto/ranking-report/get-ranking-report.dto';
import {
  assignRankingPositions,
  filterVisiblePositions,
} from './ranking/ranking-positions';
import { roundGrade } from '@app/common/utils/grade-rounding';

type RankingScope = 'admin' | 'public';

/**
 * Internal normalized row used while building and sorting ranking data.
 */
interface RankingReportRow {
  projectId: number;
  projectName: string;
  projectCode?: string;
  participantNames: string[];
  categoryId: number;
  category: string;
  position: number;
  evaluationCount: number;
  individualGrades: number[];
  averageGrade: number;
}

export interface RankingReportResult {
  eventId: number;
  eventName: string;
  scope: RankingScope;
  categoryId?: number;
  configuration: {
    visiblePublic: boolean;
    positions: number;
    gradeVisible: boolean;
  };
  items: Array<{
    projectId: number;
    projectCode?: string;
    projectName: string;
    participantNames: string[];
    categoryId: number;
    category: string;
    position: number;
    evaluationCount: number;
    individualGrades?: number[];
    averageGrade?: number;
  }>;
}

@Injectable()
export class EventService implements OnModuleInit {
  private eventService!: EventServiceClient;
  private authService!: AuthServiceClient;
  private evaluationService!: EvaluationServiceClient;
  private statusCache: EventStatusMapping[] | null = null;
  private rolesCache: any[] | null = null;

  constructor(
    @Inject(EVENT_SERVICE_NAME) private readonly eventClient: ClientGrpc,
    @Inject(AUTH_SERVICE_NAME) private readonly authClient: ClientGrpc,
    @Inject(EVALUATION_SERVICE_NAME)
    private readonly evaluationClient: ClientGrpc,
    private readonly projectsService: ProjectsService,
    private readonly listConfirmedJurorsByEventUseCase: ListConfirmedJurorsByEventUseCase,
  ) {}

  onModuleInit() {
    this.eventService =
      this.eventClient.getService<EventServiceClient>(EVENT_SERVICE_NAME);
    this.authService =
      this.authClient.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
    this.evaluationService =
      this.evaluationClient.getService<EvaluationServiceClient>(
        EVALUATION_SERVICE_NAME,
      );
  }

  /**
   * Normalizes category labels used in ranking outputs.
   */
  private normalizeCategoryName(name?: string): string {
    if (!name || !name.trim()) {
      return 'Sin categoria';
    }
    return name.trim();
  }

  /**
   * Produces a unified participant list for a project, including both
   * confirmed and pending members.
   */
  private getProjectParticipantNames(project: ProjectComplete): string[] {
    const confirmed = (project.participants ?? [])
      .map((participant) => {
        const firstName = participant.firstName?.trim() ?? '';
        const lastName = participant.lastName?.trim() ?? '';
        const fullName = `${firstName} ${lastName}`.trim();
        return fullName || participant.email || '';
      })
      .filter((value) => value.length > 0);

    const pending = (project.pendingParticipants ?? [])
      .map((participant) => {
        const firstName = participant.firstName?.trim() ?? '';
        const lastName = participant.lastName?.trim() ?? '';
        const fullName = `${firstName} ${lastName}`.trim();
        return fullName || participant.email || '';
      })
      .filter((value) => value.length > 0);

    return [...confirmed, ...pending];
  }

  /** The event as event-service returns it, without the catalog enrichment of `get` */
  async getEventById(id: number): Promise<EventProto | undefined> {
    const response = await firstValueFrom(this.eventService.getEvent({ id }));
    return response.event;
  }

  /** Approved projects of one category of the event, every page */
  async listApprovedProjects(
    eventId: number,
    categoryId: number,
  ): Promise<ProjectComplete[]> {
    return this.listAllProjectsByEvent(
      eventId,
      categoryId,
      ProjectStateFilter.APPROVED,
    );
  }

  /**
   * Paginates through all projects for an event (optionally by category and state).
   */
  private async listAllProjectsByEvent(
    eventId: number,
    categoryId?: number,
    state?: ProjectStateFilter,
  ): Promise<ProjectComplete[]> {
    let currentPage = 1;
    const itemsPerPage = 50;
    let totalPages = 1;
    const projects: ProjectComplete[] = [];

    do {
      const response = await this.projectsService.listProjectsByEvent(eventId, {
        courseId: categoryId,
        state,
        currentPage,
        itemsPerPage,
      });

      projects.push(...(response.items ?? []));
      totalPages = response.totalPages || 1;
      currentPage += 1;
    } while (currentPage <= totalPages);

    return projects;
  }

  /**
   * Fetches all evaluations created by a specific evaluator in an event.
   *
   * The evaluation-service enforces a max page size of 50, so this method
   * paginates until all pages are consumed.
   */
  private async getAllEvaluationsByEvaluator(
    eventId: number,
    evaluatorId: number,
  ) {
    const pageSize = 50;
    let page = 1;
    let totalPages = 1;
    const evaluations: Array<{ projectId: number; grade: number }> = [];

    do {
      const response = await firstValueFrom(
        this.evaluationService.findEvaluationsByEvaluator({
          userId: evaluatorId,
          eventId,
          page,
          limit: pageSize,
        }),
      );

      for (const evaluation of response.evaluations ?? []) {
        evaluations.push({
          projectId: evaluation.projectId,
          grade: evaluation.grade,
        });
      }

      totalPages = response.meta?.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages);

    return evaluations;
  }

  async generateRankingReport(
    eventId: number,
    query: GetRankingReportDto,
    scope: RankingScope,
  ): Promise<RankingReportResult> {
    // Format validation is kept explicit so non-dto callers are also safe.
    const format = query.format ?? RankingReportFormat.JSON;
    if (
      format !== RankingReportFormat.JSON &&
      format !== RankingReportFormat.EXCEL
    ) {
      throw new BadRequestException('Invalid format. Use json or excel');
    }

    const [eventResponse, rankingConfigResponse, categoriesResponse] =
      await Promise.all([
        // Intentionally uses direct getEvent gRPC call to avoid extra catalog
        // enrichment queries that are not needed for ranking generation.
        firstValueFrom(this.eventService.getEvent({ id: eventId })),
        this.getRankingEventByEventId(eventId),
        this.listCategoriesByEvent(eventId, {
          eventId,
          page: 1,
          limit: 50,
        }),
      ]);

    const eventName =
      eventResponse.event?.name?.trim() || `Evento ${String(eventId)}`;
    const rankingConfig = rankingConfigResponse.rankingEvent;

    if (!rankingConfig) {
      throw new BadRequestException(
        `Ranking configuration not found for event ${String(eventId)}`,
      );
    }

    if (scope === 'public' && !rankingConfig.visiblePublic) {
      throw new ForbiddenException(
        'Public ranking is not enabled for this event',
      );
    }

    const categories = categoriesResponse.categories ?? [];
    const categoryNameById = new Map<number, string>(
      categories.map((category) => [
        category.id,
        this.normalizeCategoryName(category.name),
      ]),
    );

    // Only approved projects compete in the ranking.
    const projects = await this.listAllProjectsByEvent(
      eventId,
      query.categoryId,
      ProjectStateFilter.APPROVED,
    );

    const evaluatorProjectGrades = new Map<number, Map<number, number>>();
    const rows: RankingReportRow[] = [];

    // Build ranking candidates by combining project metadata + evaluation stats.
    for (const project of projects) {
      const stats = await firstValueFrom(
        this.evaluationService.getProjectStats({ projectId: project.id }),
      );

      // Projects without evaluations have no grade to rank; leaving them in
      // would tie them all at 0 and push them into the public cut together.
      if (!stats.evaluationCount) {
        continue;
      }

      const individualGrades: number[] = [];
      for (const evaluatorId of stats.evaluatorIds ?? []) {
        if (!evaluatorProjectGrades.has(evaluatorId)) {
          const evaluatorEvaluations =
            await this.getAllEvaluationsByEvaluator(eventId, evaluatorId);

          const projectGrades = new Map<number, number>();
          for (const evaluation of evaluatorEvaluations) {
            if (!projectGrades.has(evaluation.projectId)) {
              projectGrades.set(evaluation.projectId, evaluation.grade);
            }
          }

          evaluatorProjectGrades.set(evaluatorId, projectGrades);
        }

        const grade = evaluatorProjectGrades.get(evaluatorId)?.get(project.id);
        if (grade !== undefined) {
          // Historical grades were stored without rounding; show them with the same 2 decimals as the average
          individualGrades.push(roundGrade(grade));
        }
      }

      const categoryId = project.courseId;
      const categoryName =
        categoryNameById.get(categoryId) || `Categoria ${String(categoryId)}`;

      rows.push({
        projectId: project.id,
        projectCode: project.projectCode,
        projectName: project.name,
        participantNames: this.getProjectParticipantNames(project),
        categoryId,
        category: categoryName,
        position: 0,
        evaluationCount: stats.evaluationCount,
        individualGrades,
        // Rounded with the same rule used for positions, so co-winners always
        // show the same grade.
        averageGrade: roundGrade(stats.averageGrade ?? 0),
      });
    }

    // Tied averages share the position (co-winners); no tie-break is applied.
    const rankedRows = assignRankingPositions(rows);

    // Public scope exposes only the top-N positions, including every co-winner.
    const visibleRows =
      scope === 'public'
        ? filterVisiblePositions(rankedRows, rankingConfig.positions)
        : rankedRows;

    // In public mode, grade fields are conditional by ranking configuration.
    const showGrades = scope === 'admin' || rankingConfig.gradeVisible;

    return {
      eventId,
      eventName,
      scope,
      categoryId: query.categoryId,
      configuration: {
        visiblePublic: rankingConfig.visiblePublic,
        positions: rankingConfig.positions,
        gradeVisible: rankingConfig.gradeVisible,
      },
      items: visibleRows.map((row) => ({
        projectId: row.projectId,
        projectCode: row.projectCode,
        projectName: row.projectName,
        participantNames: row.participantNames,
        categoryId: row.categoryId,
        category: row.category,
        position: row.position,
        evaluationCount: row.evaluationCount,
        individualGrades: showGrades ? row.individualGrades : undefined,
        averageGrade: showGrades ? row.averageGrade : undefined,
      })),
    };
  }

  /**
   * Builds an XLSX buffer from ranking JSON data.
   * The controller is responsible for setting download headers.
   */
  async generateRankingExcelBuffer(report: RankingReportResult): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ranking');

    worksheet.columns = [
      { header: 'Posición', key: 'position', width: 10 },
      { header: 'Código', key: 'projectCode', width: 10 },
      { header: 'Proyecto', key: 'projectName', width: 32 },
      { header: 'Categoría', key: 'category', width: 24 },
      { header: 'Participantes', key: 'participantNames', width: 48 },
      { header: 'Evaluaciones', key: 'evaluationCount', width: 14 },
      { header: 'Calificaciones', key: 'individualGrades', width: 28 },
      { header: 'Puntaje Final', key: 'averageGrade', width: 14 },
    ];

    for (const item of report.items) {
      worksheet.addRow({
        position: item.position,
        projectCode: item.projectCode || '',
        projectName: item.projectName,
        category: item.category,
        participantNames: item.participantNames.join(', '),
        evaluationCount: item.evaluationCount,
        individualGrades: item.individualGrades?.length
          ? item.individualGrades.join(', ')
          : '',
        averageGrade:
          item.averageGrade !== undefined
            ? roundGrade(item.averageGrade)
            : '',
      });
    }

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = 'A1:H1';

    const headerRow = worksheet.getRow(1);
    headerRow.height = 20;
    headerRow.eachCell((cell: ExcelJS.Cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF5B9BD5' },
      };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF9CC2E5' } },
        left: { style: 'thin', color: { argb: 'FF9CC2E5' } },
        bottom: { style: 'thin', color: { argb: 'FF9CC2E5' } },
        right: { style: 'thin', color: { argb: 'FF9CC2E5' } },
      };
    });

    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex += 1) {
      const row = worksheet.getRow(rowIndex);
      row.eachCell((cell: ExcelJS.Cell, columnNumber: number) => {
        cell.alignment = {
          horizontal: columnNumber <= 2 ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
          left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
          bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
          right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
        };
        if (rowIndex % 2 === 0) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF7FBFF' },
          };
        }
      });
    }

    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(1).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getColumn(2).width = 10;
    worksheet.getColumn(2).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getColumn(3).width = 32;
    worksheet.getColumn(4).width = 24;
    worksheet.getColumn(5).width = 48;
    worksheet.getColumn(6).width = 14;
    worksheet.getColumn(7).width = 28;
    worksheet.getColumn(8).width = 14;

    const rawBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(rawBuffer);
  }

  private mapCourseForFrontend(
    category: {
      id: number;
      eventId: number;
      name: string;
      description: string;
      active: boolean;
      createdAt: string;
    },
    event?: { id: number; name: string },
  ) {
    return {
      id: category.id,
      eventId: category.eventId,
      code: category.name,
      description: category.description || undefined,
      active: category.active,
      event,
      createdAt: category.createdAt
        ? Math.floor(new Date(category.createdAt).getTime() / 1000)
        : 0,
    };
  }

  private getNextPageToken(meta?: {
    currentPage?: number;
    totalPages?: number;
  }): string {
    const currentPage = meta?.currentPage ?? 1;
    const totalPages = meta?.totalPages ?? 1;

    return currentPage < totalPages ? String(currentPage + 1) : '';
  }

  private async getEventCatalogData(eventId: number) {
    const [categoriesResponse, detailsResponse] = await Promise.all([
      this.listCategoriesByEvent(eventId, {
        eventId,
        page: 1,
        limit: 50,
      }),
      this.listEventInscriptionDetails({
        eventId,
        page: 1,
        limit: 50,
      }),
    ]);

    const categories = categoriesResponse.categories ?? [];
    const awardsByCategory = await Promise.all(
      categories.map((category) =>
        this.listCategoryAwards({
          categoryId: category.id,
          page: 1,
          limit: 50,
        }),
      ),
    );

    return {
      category: categories[0] ?? null,
      categories,
      awards: awardsByCategory.flatMap((item) => item.awards ?? []),
      specificInscriptionDetails: detailsResponse.details ?? [],
    };
  }

  private async enrichEventWithCatalogData<T extends { id: number }>(event: T) {
    const catalogData = await this.getEventCatalogData(event.id);
    return {
      ...event,
      ...catalogData,
    };
  }

  private async enrichEventsWithCatalogData<T extends { id: number }>(
    events: T[],
  ) {
    if (!events || events.length === 0) {
      return [];
    }

    return Promise.all(
      events.map((event) => this.enrichEventWithCatalogData(event)),
    );
  }

  private normalizeUpdateEventDTO(updateEventDTO: UpdateEventDTO): any {
    const payload = updateEventDTO as any;

    if (payload.event) {
      return {
        ...payload.event,
        id: payload.id ?? payload.event.id,
      };
    }

    return payload;
  }

  private async upsertEventCategories(
    eventId: number,
    categories?: Array<Partial<CreateCategoryDTO & UpdateCategoryDTO>>,
  ): Promise<number[]> {
    if (!categories) {
      return [];
    }

    const categoryIds: number[] = [];

    for (const category of categories) {
      if (category.id) {
        await this.updateCategory({
          id: category.id,
          name: category.name,
          description: category.description,
          active: category.active,
        });
        categoryIds.push(category.id);
        continue;
      }

      const response = await this.createCategory({
        eventId: category.eventId ?? eventId,
        name: category.name?.trim() || String(eventId),
        description: category.description,
        active: category.active ?? true,
      });

      if (response.category?.id) {
        categoryIds.push(response.category.id);
      }
    }

    return categoryIds;
  }

  private async getDefaultCategoryId(
    eventId: number,
    categoryIds: number[],
  ): Promise<number | undefined> {
    if (categoryIds.length > 0) {
      return categoryIds[0];
    }

    const response = await this.listCategoriesByEvent(eventId, {
      eventId,
      page: 1,
      limit: 1,
    });

    return response.categories?.[0]?.id;
  }

  private async upsertEventAwards(
    eventId: number,
    categoryIds: number[],
    awards?: Array<Partial<CreateCategoryAwardDTO & UpdateCategoryAwardDTO>>,
  ) {
    if (!awards) {
      return;
    }

    const defaultCategoryId = await this.getDefaultCategoryId(
      eventId,
      categoryIds,
    );

    await Promise.all(
      awards.map((award) => {
        if (award.id) {
          return this.updateCategoryAward({
            id: award.id,
            title: award.title,
            description: award.description,
            value: award.value,
            position: award.position,
          });
        }

        const categoryId = award.categoryId ?? defaultCategoryId;
        if (!categoryId) {
          throw new BadRequestException(
            'categoryId is required to create an award',
          );
        }

        return this.createCategoryAward({
          categoryId,
          title: award.title ?? '',
          description: award.description,
          value: award.value,
          position: award.position ?? 0,
        });
      }),
    );
  }

  private async upsertEventInscriptionDetails(
    eventId: number,
    details?: Array<
      Partial<CreateEventInscriptionDetailDTO & UpdateEventInscriptionDetailDTO>
    >,
  ) {
    if (!details) {
      return;
    }

    await Promise.all(
      details.map((detail) => {
        if (detail.id) {
          return this.updateEventInscriptionDetail({
            id: detail.id,
            title: detail.title,
            description: detail.description,
            value: detail.value,
            isRequired: detail.isRequired,
          });
        }

        return this.createEventInscriptionDetail({
          eventId: detail.eventId ?? eventId,
          title: detail.title ?? '',
          description: detail.description,
          value: detail.value ?? 0,
          isRequired: detail.isRequired ?? true,
        });
      }),
    );
  }

  private async updateEventCatalogData(
    eventId: number,
    categories?: Array<Partial<CreateCategoryDTO & UpdateCategoryDTO>>,
    awards?: Array<Partial<CreateCategoryAwardDTO & UpdateCategoryAwardDTO>>,
    details?: Array<
      Partial<CreateEventInscriptionDetailDTO & UpdateEventInscriptionDetailDTO>
    >,
  ) {
    const categoryIds = await this.upsertEventCategories(eventId, categories);

    await Promise.all([
      this.upsertEventAwards(eventId, categoryIds, awards),
      this.upsertEventInscriptionDetails(eventId, details),
    ]);
  }

  async create(createEventDTO: CreateEventDTO): Promise<CreateEventResponse> {
    const {
      category,
      awards,
      specificInscriptionDetails,
      eventInscriptionDetails,
      ...eventPayload
    } = createEventDTO as CreateEventDTO & {
      category?: CreateCategoryDTO;
      awards?: Omit<CreateCategoryAwardDTO, 'categoryId'>[];
      specificInscriptionDetails?: CreateEventInscriptionDetailDTO[];
      eventInscriptionDetails?: CreateEventInscriptionDetailDTO[];
    };
    const nestedInscriptionDetails =
      specificInscriptionDetails ?? eventInscriptionDetails;

    const response = await firstValueFrom(
      this.eventService.createEvent(eventPayload as CreateEventRequest),
    );

    if (response.event) {
      let createdCategoryId: number | undefined;
      try {
        const categoryResponse = await this.createCategory({
          eventId: response.event.id,
          name: category?.name?.trim() || String(response.event.id),
          description: category?.description,
          active: category?.active ?? true,
        });
        createdCategoryId = categoryResponse.category?.id;

        if (createdCategoryId && awards?.length) {
          await Promise.all(
            awards.map((award) =>
              this.createCategoryAward({
                ...award,
                categoryId: createdCategoryId!,
              }),
            ),
          );
        }
      } catch (error) {
        if (createdCategoryId) {
          try {
            await this.deleteCategory(createdCategoryId);
          } catch {}
        }
        await this.delete({ id: response.event.id });
        throw error;
      }
    }

    if (response.event && nestedInscriptionDetails?.length) {
      try {
        await Promise.all(
          nestedInscriptionDetails.map((detail) =>
            this.createEventInscriptionDetail({
              ...detail,
              eventId: response.event!.id,
            }),
          ),
        );
      } catch (error) {
        await this.delete({ id: response.event.id });
        throw error;
      }
    }

    if (response.event) {
      const statuses = await this.getAndCacheStatuses();
      const enrichedEvent = this.enrichSingleEventWithStatus(
        response.event,
        statuses,
      );
      return { event: enrichedEvent as EventProto };
    }

    return response;
  }

  async delete(deleteEventDTO: DeleteEventDTO): Promise<DeleteEventResponse> {
    return firstValueFrom(
      this.eventService.deleteEvent(deleteEventDTO as DeleteEventRequest),
    );
  }

  async get(getEventDTO: GetEventDTO): Promise<GetEventResponse> {
    const response = await firstValueFrom(
      this.eventService.getEvent(getEventDTO as GetEventRequest),
    );

    if (response.event) {
      const statuses = await this.getAndCacheStatuses();
      const enrichedEvent = this.enrichSingleEventWithStatus(
        response.event,
        statuses,
      );
      const enrichedEventWithCatalog =
        await this.enrichEventWithCatalogData(enrichedEvent);
      return { event: enrichedEventWithCatalog as any };
    }

    return response;
  }

  async update(updateEventDTO: UpdateEventDTO): Promise<UpdateEventResponse> {
    const normalizedDTO = this.normalizeUpdateEventDTO(updateEventDTO);
    const {
      categories,
      awards,
      specificInscriptionDetails,
      event,
      createdAt,
      updatedAt,
      status,
      statusName,
      statusDescription,
      createdByUserId,
      category,
      ...eventPayload
    } = normalizedDTO;

    const response = await firstValueFrom(
      this.eventService.updateEvent(eventPayload as UpdateEventRequest),
    );

    await this.updateEventCatalogData(
      eventPayload.id,
      categories,
      awards,
      specificInscriptionDetails,
    );

    if (response.event) {
      const statuses = await this.getAndCacheStatuses();
      const enrichedEvent = this.enrichSingleEventWithStatus(
        response.event,
        statuses,
      );
      const enrichedEventWithCatalog =
        await this.enrichEventWithCatalogData(enrichedEvent);
      return { event: enrichedEventWithCatalog as any };
    }

    return response;
  }

  async createMember(
    createEventMemberDTO: CreateEventMemberDTO,
  ): Promise<CreateEventMemberResponse> {
    return firstValueFrom(
      this.eventService.createEventMember(
        createEventMemberDTO as CreateEventMemberRequest,
      ),
    );
  }

  async deleteMember(
    deleteEventMemberDTO: DeleteEventMemberDTO,
  ): Promise<DeleteEventMemberResponse> {
    return firstValueFrom(
      this.eventService.deleteEventMember(
        deleteEventMemberDTO as DeleteEventMemberRequest,
      ),
    );
  }

  async listMembers(
    listEventMembersDTO: ListEventMembersDTO,
  ): Promise<ListEventMembersResponse> {
    return firstValueFrom(
      this.eventService.listEventMembers(
        listEventMembersDTO as ListEventMembersRequest,
      ),
    );
  }

  async listConfirmedJurorsByEvent(
    eventId: number,
  ): Promise<ListConfirmedJurorsByEventResponse> {
    return this.listConfirmedJurorsByEventUseCase.execute(eventId);
  }

  async createCategory(
    dto: CreateCategoryDTO,
  ): Promise<CreateCategoryResponse> {
    return firstValueFrom(
      this.eventService.createCategory(dto as CreateCategoryRequest),
    );
  }

  async updateCategory(
    dto: UpdateCategoryDTO,
  ): Promise<UpdateCategoryResponse> {
    return firstValueFrom(
      this.eventService.updateCategory(dto as UpdateCategoryRequest),
    );
  }

  async getCategory(id: number): Promise<GetCategoryResponse> {
    return firstValueFrom(
      this.eventService.getCategory({ id } as GetCategoryRequest),
    );
  }

  async listCategories(
    dto: ListCategoriesDTO,
  ): Promise<ListCategoriesResponse> {
    return firstValueFrom(
      this.eventService.listCategories(dto as ListCategoriesRequest),
    );
  }

  async listCategoriesByEvent(
    eventId: number,
    dto: ListCategoriesDTO,
  ): Promise<ListCategoriesResponse> {
    return firstValueFrom(
      this.eventService.listCategoriesByEvent({
        ...dto,
        eventId,
      } as ListCategoriesByEventRequest),
    );
  }

  async deleteCategory(id: number): Promise<DeleteCategoryResponse> {
    return firstValueFrom(
      this.eventService.deleteCategory({ id } as DeleteCategoryRequest),
    );
  }

  async getDashboardStats() {
    return firstValueFrom(this.eventService.getDashboardStats({}));
  }

  async getEventsForAR(): Promise<GetEventsForARResponse> {
    return firstValueFrom(this.eventService.getEventsForAr({} as GetEventsForARRequest));
  }

  async createCourse(dto: CreateCourseDTO): Promise<CreateCourseResponse> {
    await this.createCategory({
      eventId: dto.eventId,
      name: dto.code,
      description: dto.description,
      active: dto.active,
    });

    return {
      ok: true,
      message: 'Course created successfully',
    };
  }

  async updateCourse(dto: UpdateCourseDTO): Promise<UpdateCourseResponse> {
    await this.updateCategory({
      id: dto.id,
      name: dto.code,
      description: dto.description,
      active: dto.active,
    });

    return {
      ok: true,
      message: 'Course updated successfully',
    };
  }

  async getCourse(id: number): Promise<GetCourseResponse> {
    const response = await this.getCategory(id);
    const category = response.category;

    if (!category) {
      throw new Error(`Category ${id} was not returned by event-service`);
    }

    return {
      course: {
        id: category.id,
        eventId: category.eventId,
        code: category.name,
        description: category.description,
        active: category.active,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    };
  }

  async listCourses(dto: ListCoursesDTO): Promise<ListCoursesResponse> {
    const [response, eventResponse] = await Promise.all([
      this.listCategories({
        eventId: dto.eventId,
        onlyActive: dto.onlyActive,
        page: dto.page,
        limit: dto.limit,
        q: dto.q,
      }),
      dto.eventId
        ? this.get({ id: dto.eventId })
        : Promise.resolve({ event: undefined } as GetEventResponse),
    ]);

    const event = eventResponse.event
      ? {
          id: eventResponse.event.id,
          name: eventResponse.event.name,
        }
      : undefined;

    return {
      courses: response.categories.map((category) =>
        this.mapCourseForFrontend(category, event),
      ) as any,
      nextPageToken: this.getNextPageToken(response.meta),
    } as any;
  }

  async listCoursesByEvent(
    eventId: number,
    dto: ListCoursesByEventDTO,
  ): Promise<ListCoursesResponse> {
    const response = await this.listCourses({
      ...dto,
      eventId,
    });

    return response;
  }

  async listCoursesForDropdown(
    dto: ListCoursesForDropdownDTO,
  ): Promise<ListCoursesForDropdownResponse> {
    const eventId = dto.eventId as number;
    const response = await this.listCategoriesByEvent(eventId, {
      eventId,
      onlyActive: dto.onlyActive,
      page: 1,
      limit: 1000,
    });

    return {
      courses: response.categories.map((category) => ({
        id: category.id,
        code: category.name,
        description: category.description,
      })),
    };
  }

  async deleteCourse(id: number): Promise<DeleteCourseResponse> {
    await this.deleteCategory(id);
    return {
      ok: true,
    };
  }

  async createCategoryAward(
    dto: CreateCategoryAwardDTO,
  ): Promise<CreateCategoryAwardResponse> {
    return firstValueFrom(
      this.eventService.createCategoryAward(dto as CreateCategoryAwardRequest),
    );
  }

  async updateCategoryAward(
    dto: UpdateCategoryAwardDTO,
  ): Promise<UpdateCategoryAwardResponse> {
    return firstValueFrom(
      this.eventService.updateCategoryAward(dto as UpdateCategoryAwardRequest),
    );
  }

  async getCategoryAward(id: number): Promise<GetCategoryAwardResponse> {
    return firstValueFrom(
      this.eventService.getCategoryAward({ id } as GetCategoryAwardRequest),
    );
  }

  async listCategoryAwards(
    dto: ListCategoryAwardsDTO,
  ): Promise<ListCategoryAwardsResponse> {
    return firstValueFrom(
      this.eventService.listCategoryAwards(dto as ListCategoryAwardsRequest),
    );
  }

  async deleteCategoryAward(id: number): Promise<DeleteCategoryAwardResponse> {
    return firstValueFrom(
      this.eventService.deleteCategoryAward({
        id,
      } as DeleteCategoryAwardRequest),
    );
  }

  async createAwardWinner(
    dto: CreateAwardWinnerDTO,
  ): Promise<CreateAwardWinnerResponse> {
    return firstValueFrom(
      this.eventService.createAwardWinner(dto as CreateAwardWinnerRequest),
    );
  }

  async updateAwardWinner(
    dto: UpdateAwardWinnerDTO,
  ): Promise<UpdateAwardWinnerResponse> {
    return firstValueFrom(
      this.eventService.updateAwardWinner(dto as UpdateAwardWinnerRequest),
    );
  }

  async getAwardWinner(id: number): Promise<GetAwardWinnerResponse> {
    return firstValueFrom(
      this.eventService.getAwardWinner({ id } as GetAwardWinnerRequest),
    );
  }

  /** Awards won by the given projects in active categories, with the event publication flag */
  async listAwardsByProjects(
    projectIds: number[],
  ): Promise<ListAwardsByProjectsResponse> {
    return firstValueFrom(this.eventService.listAwardsByProjects({ projectIds }));
  }

  async listAwardWinners(
    dto: ListAwardWinnersDTO,
  ): Promise<ListAwardWinnersResponse> {
    return firstValueFrom(
      this.eventService.listAwardWinners(dto as ListAwardWinnersRequest),
    );
  }

  async deleteAwardWinner(id: number): Promise<DeleteAwardWinnerResponse> {
    return firstValueFrom(
      this.eventService.deleteAwardWinner({ id } as DeleteAwardWinnerRequest),
    );
  }

  async createEventInscriptionDetail(
    dto: CreateEventInscriptionDetailDTO,
  ): Promise<CreateEventInscriptionDetailResponse> {
    return firstValueFrom(
      this.eventService.createEventInscriptionDetail(
        dto as CreateEventInscriptionDetailRequest,
      ),
    );
  }

  async updateEventInscriptionDetail(
    dto: UpdateEventInscriptionDetailDTO,
  ): Promise<UpdateEventInscriptionDetailResponse> {
    return firstValueFrom(
      this.eventService.updateEventInscriptionDetail(
        dto as UpdateEventInscriptionDetailRequest,
      ),
    );
  }

  async getEventInscriptionDetail(
    id: number,
  ): Promise<GetEventInscriptionDetailResponse> {
    return firstValueFrom(
      this.eventService.getEventInscriptionDetail({
        id,
      } as GetEventInscriptionDetailRequest),
    );
  }

  async listEventInscriptionDetails(
    dto: ListEventInscriptionDetailsDTO,
  ): Promise<ListEventInscriptionDetailsResponse> {
    return firstValueFrom(
      this.eventService.listEventInscriptionDetails(
        dto as ListEventInscriptionDetailsRequest,
      ),
    );
  }

  async deleteEventInscriptionDetail(
    id: number,
  ): Promise<DeleteEventInscriptionDetailResponse> {
    return firstValueFrom(
      this.eventService.deleteEventInscriptionDetail({
        id,
      } as DeleteEventInscriptionDetailRequest),
    );
  }

  async createEventRecap(
    dto: CreateEventRecapDTO,
  ): Promise<CreateEventRecapResponse> {
    return firstValueFrom(
      this.eventService.createEventRecap(dto as CreateEventRecapRequest),
    );
  }

  async updateEventRecap(
    dto: UpdateEventRecapDTO,
  ): Promise<UpdateEventRecapResponse> {
    return firstValueFrom(
      this.eventService.updateEventRecap(dto as UpdateEventRecapRequest),
    );
  }

  async getEventRecap(id: number): Promise<GetEventRecapResponse> {
    return firstValueFrom(
      this.eventService.getEventRecap({ id } as GetEventRecapRequest),
    );
  }

  async listEventRecaps(
    dto: ListEventRecapsDTO,
  ): Promise<ListEventRecapsResponse> {
    return firstValueFrom(
      this.eventService.listEventRecaps(dto as ListEventRecapsRequest),
    );
  }

  async deleteEventRecap(id: number): Promise<DeleteEventRecapResponse> {
    return firstValueFrom(
      this.eventService.deleteEventRecap({ id } as DeleteEventRecapRequest),
    );
  }

  async createRankingEvent(dto: CreateRankingEventDTO): Promise<RankingEventResponse> {
    return firstValueFrom(
      this.eventService.createRankingEvent(dto as CreateRankingEventRequest),
    );
  }

  async updateRankingEvent(id: number, dto: UpdateRankingEventDTO): Promise<RankingEventResponse> {
    return firstValueFrom(
      this.eventService.updateRankingEvent({ ...dto, id } as UpdateRankingEventRequest),
    );
  }

  async getRankingEvent(id: number): Promise<RankingEventResponse> {
    return firstValueFrom(
      this.eventService.getRankingEvent({ id } as GetRankingEventRequest),
    );
  }

  async getRankingEventByEventId(eventId: number): Promise<RankingEventResponse> {
    return firstValueFrom(
      this.eventService.getRankingEventByEventId({ eventId } as GetRankingEventByEventIdRequest),
    );
  }

  async deleteRankingEvent(id: number): Promise<DeleteRankingEventResponse> {
    return firstValueFrom(
      this.eventService.deleteRankingEvent({ id } as DeleteRankingEventRequest),
    );
  }

  /**
   * Get event statuses from service and cache them
   * This is called internally to enrich events with human-readable status
   */
  async getEventStatuses(): Promise<GetEventStatusesResponse> {
    return firstValueFrom(
      this.eventService.getEventStatuses({} as GetEventStatusesRequest),
    );
  }

  /**
   * Get and cache event statuses (in-memory cache)
   * TTL is managed at HTTP layer via Redis cache
   */
  private async getAndCacheStatuses(): Promise<EventStatusMapping[]> {
    if (!this.statusCache) {
      const response = await this.getEventStatuses();
      this.statusCache = response.statuses;
    }
    return this.statusCache;
  }

  /**
   * Get all roles from auth-service and cache them
   * TTL is managed at HTTP layer via Redis cache
   */
  private async getAndCacheRoles(): Promise<any[]> {
    if (!this.rolesCache) {
      const response = await firstValueFrom(this.authService.getRoles({}));
      this.rolesCache = response.roles;
    }
    return this.rolesCache;
  }

  /**
   * Enrich a single event with human-readable status names
   * Removes the numeric status field from response
   */
  private enrichSingleEventWithStatus<T extends EventProto | EventWithRole>(
    event: T,
    statuses: EventStatusMapping[],
  ): T & { statusName?: string; statusDescription?: string } {
    const { status, ...eventWithoutStatus } = event;
    return {
      ...eventWithoutStatus,
      statusName: statuses.find((s) => s.value === status)?.name,
      statusDescription: statuses.find((s) => s.value === status)?.description,
    } as T & { statusName?: string; statusDescription?: string };
  }

  /**
   * Enrich events array with human-readable status names
   */
  private enrichEventsWithStatus<T extends EventProto | EventWithRole>(
    events: T[],
    statuses: EventStatusMapping[],
  ): Array<T & { statusName?: string; statusDescription?: string }> {
    // Handle empty or undefined arrays
    if (!events || events.length === 0) {
      return [];
    }

    return events.map((event) =>
      this.enrichSingleEventWithStatus(event, statuses),
    );
  }

  /**
   * List events where the user is a member (with role information)
   * Enriches events with human-readable status names and role details
   */
  async listMyEvents(
    userId: number,
    dto: ListMyEventsDTO,
  ): Promise<ListMyEventsResponse> {
    const response = await firstValueFrom(
      this.eventService.listMyEvents({ userId, ...dto } as ListMyEventsRequest),
    );

    if (!response.events || response.events.length === 0) {
      return {
        ...response,
        events: [],
      };
    }

    // Get cached statuses and roles
    const [statuses, roles] = await Promise.all([
      this.getAndCacheStatuses(),
      this.getAndCacheRoles(),
    ]);

    // Enrich events with status and role information
    const enrichedEvents = response.events.map((event) => {
      const { status, roleId, ...eventWithoutStatusAndRoleId } = event;
      const role = roles.find((r) => r.id === roleId);

      return {
        ...eventWithoutStatusAndRoleId,
        statusName: statuses.find((s) => s.value === status)?.name,
        statusDescription: statuses.find((s) => s.value === status)
          ?.description,
        role: role
          ? {
              id: role.id,
              name: role.name,
              scope: role.scope,
              description: role.description,
            }
          : null,
      };
    });

    const enrichedEventsWithCatalog =
      await this.enrichEventsWithCatalogData(enrichedEvents);

    return {
      ...response,
      events: enrichedEventsWithCatalog as any,
    };
  }

  /**
   * List all events (public or admin view)
   * Enriches events with human-readable status names
   */
  async listEvents(dto: ListEventsDTO): Promise<ListEventsResponse> {
    const response = await firstValueFrom(
      this.eventService.listEvents(dto as ListEventsRequest),
    );

    const statuses = await this.getAndCacheStatuses();
    const enrichedEvents = this.enrichEventsWithStatus(
      response.events,
      statuses,
    );
    const enrichedEventsWithCatalog =
      await this.enrichEventsWithCatalogData(enrichedEvents);

    return {
      ...response,
      events: enrichedEventsWithCatalog as any,
    };
  }

  async getMyProjectForEvent(userId: number, eventId: number) {
    const [projectResponse, eventResponse] = await Promise.all([
      this.projectsService.getMyProjectByEvent(userId, eventId),
      this.get({ id: eventId }),
    ]);

    const project = projectResponse.project
      ? {
          ...projectResponse.project,
          participants: (projectResponse.project.participants ?? []).map(
            ({ studentCode, semester, career, status, ...participant }) => ({
              ...participant,
              ParticipantCode: studentCode,
              semester,
              career,
              status,
            }),
          ),
        }
      : undefined;

    return {
      project,
      event: eventResponse.event,
    };
  }
}
