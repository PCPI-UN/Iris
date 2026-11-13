import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Patch,
  Query,
  ParseIntPipe,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiSecurity,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { InvalidateCache } from '../../common/cache/invalidate-cache.decorator';
import { EventService } from './events.service';
import { EventStatus } from '@app/common/generated/event';

// Event DTOs
import { CreateEventDTO } from './dto/events/create-event.dto';
import { UpdateEventDTO } from './dto/events/update-event.dto';
import { ListEventsDTO } from './dto/events/list-events.dto';
import { ListMyEventsDTO } from './dto/events/list-my-events.dto';
import { ListEventsDropdownDTO } from './dto/events/list-events-dropdown.dto';

// Event Member DTOs
import { CreateEventMemberDTO } from './dto/event-members/create-event-member.dto';
import { DeleteEventMemberDTO } from './dto/event-members/delete-event-member.dto';
import { ListEventMembersDTO } from './dto/event-members/list-event-members.dto';
import { CreateCourseDTO } from './dto/courses/create-course.dto';
import { ListCoursesByEventDTO } from './dto/courses/list-courses-by-event.dto';
import { ListCoursesDTO } from './dto/courses/list-course.dto';
import { ListCoursesForDropdownDTO } from './dto/courses/list-courses-for-dropdown.dto';
import { UpdateCourseDTO } from './dto/courses/update-course.dto';
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
import { CreateRankingEventDTO } from './dto/ranking-event/create-ranking-event.dto';
import { UpdateRankingEventDTO } from './dto/ranking-event/update-ranking-event.dto';
import {
  GetRankingReportDto,
  RankingReportFormat,
} from './dto/ranking-report/get-ranking-report.dto';
import { Response } from 'express';
import { RankingReportResult } from './events.service';

@ApiTags('events')
@ApiSecurity('JWT-auth')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventService) {}

  private normalizeFilePart(value: string): string {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalized || 'general';
  }

  private buildRankingFileName(
    report: RankingReportResult,
    scope: 'admin' | 'public',
  ): string {
    const categoryName =
      report.items[0]?.category || (report.categoryId ? `categoria_${report.categoryId}` : 'general');

    return `ranking_${this.normalizeFilePart(categoryName)}_${this.normalizeFilePart(report.eventName)}_${scope}.xlsx`;
  }

  // =====================
  // EVENT LISTING ENDPOINTS
  // =====================

  /**
   * PUBLIC ENDPOINT - List upcoming events only
   * No authentication required
   * Always filters by UPCOMING status
   */
  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'List upcoming public events',
    description:
      'Get a paginated list of upcoming events. No authentication required. Status is always UPCOMING.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of upcoming events with pagination',
  })
  async listPublicEvents(@Query() query: ListEventsDTO) {
    // Hardcode statuses to UPCOMING and onlyActive to true
    return this.eventsService.listEvents({
      ...query,
      status: undefined,
      statuses: [
        EventStatus.UPCOMING,
        EventStatus.AVAILABLE,
        EventStatus.REGISTRATION_CLOSED,
      ],
      onlyActive: true,
    });
  }

  /**
   * PUBLIC ENDPOINT - List past (closed) public events only
   * No authentication required
   * Returns events with CLOSED status
   */
  @Public()
  @Get('public/past')
  @ApiOperation({
    summary: 'List past public events',
    description:
      'Get a paginated list of past (closed) events. No authentication required. Status is always CLOSED.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of past events with pagination',
  })
  async listPastPublicEvents(@Query() query: ListEventsDTO) {
    return this.eventsService.listEvents({
      ...query,
      status: undefined,
      statuses: [EventStatus.CLOSED],
      onlyActive: false,
    });
  }

  /**
   * ADMIN ENDPOINT - List all events with filtering
   * Requires manage:events permission (Admin/EventManager only)
   */
  @RequirePermission('read:events')
  @Get()
  @ApiOperation({
    summary: 'List all events (admin)',
    description:
      'Get a paginated list of all events in the system with optional filters. Requires read:events permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of events with pagination',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing read:events permission',
  })
  async listEvents(@Query() query: ListEventsDTO) {
    return this.eventsService.listEvents(query);
  }

  /**
   * USER ENDPOINT - List events where user is a member
   * Authenticated users only
   * Returns events with user's role information
   */
  @Get('my-events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List my events',
    description:
      'Get a paginated list of events where the authenticated user is a member. Includes role information.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of user events with roles and pagination',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error - query parameters are out of range or malformed',
    content: {
      'application/json': {
        examples: {
          limitTooHigh: {
            summary: 'limit exceeds the allowed maximum',
            value: {
              statusCode: 400,
              message: 'Validación fallida: limit no puede ser mayor que 50',
              timestamp: '2026-05-29T00:18:18.737Z',
            },
          },
        },
      },
    },
  })
  async listMyEvents(
    @GetUser('id') userId: number,
    @Query() query: ListMyEventsDTO,
  ) {
    return this.eventsService.listMyEvents(userId, query);
  }

  @RequirePermission('read:events')
  @Get('dropdown')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List events for dropdown' })
  @ApiResponse({
    status: 200,
    description: 'Returns events for dropdown',
    schema: {
      example: {
        events: [{ id: 1, name: 'Nombre del evento' }],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Missing read:events permission' })
  async listEventsDropdown(
    @Query() query: ListEventsDropdownDTO,
  ) {
    // Access is decided by read:events (Admin, FacultyAdmin, EventManager, Dean), not by role name
    const response = await this.eventsService.listEvents(query);

    return {
      events: (response.events ?? []).map((event) => ({
        id: event.id,
        name: event.name,
      })),
    };
  }

  /**
   * Get event status mappings (for frontend caching)
   * Public endpoint
   */
  @Public()
  @Get('statuses')
  @ApiOperation({
    summary: 'Get event status mappings',
    description:
      'Get human-readable event status enum mappings (UPCOMING, REGISTRATION_CLOSED, AVAILABLE, CLOSED)',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns event status mappings',
    schema: {
      example: {
        statuses: [
          {
            value: 1,
            name: 'UPCOMING',
            description: "Event hasn't started, registrations still open",
          },
          {
            value: 2,
            name: 'REGISTRATION_CLOSED',
            description: "Registrations closed, event hasn't started yet",
          },
          {
            value: 3,
            name: 'AVAILABLE',
            description: 'Event is currently happening',
          },
          { value: 4, name: 'CLOSED', description: 'Event has ended' },
        ],
      },
    },
  })
  async getEventStatuses() {
    return this.eventsService.getEventStatuses();
  }

  /**
   * PUBLIC ENDPOINT - Get events for AR view
   * Returns all active events with GPS coordinates for mobile AR display
   * No authentication required
   */
  @Public()
  @Get('ar')
  @ApiOperation({
    summary: 'Get events for AR view',
    description:
      'Get all active events with GPS coordinates for augmented reality mobile display',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of events with location data for AR',
    schema: {
      example: {
        events: [
          {
            id: 1,
            name: 'Event Name',
            description: 'Event Description',
            start_date: '2026-06-01T10:00:00Z',
            end_date: '2026-06-01T18:00:00Z',
            location: 'Venue Name',
            latitude: 10.3932,
            longitude: -75.4898,
          },
        ],
      },
    },
  })
  async getEventsForAR() {
    return this.eventsService.getEventsForAR();
  }

  // =====================
  // EVENT CRUD ENDPOINTS
  // =====================

  /**
   * Create a new event
   * Requires manage:events permission
   * Injects createdByUserId from authenticated user
   */
  @RequirePermission('manage:events')
  @Post()
  @InvalidateCache({
    endpoints: ['/events', '/events/public', '/events/my-events'],
  })
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing manage:events permission',
  })
  async createEvent(
    @Body() createEventDTO: CreateEventDTO,
    @GetUser('id') userId: number,
  ) {
    // Inject createdByUserId from authenticated user
    return this.eventsService.create({
      ...createEventDTO,
      createdByUserId: userId,
    } as any);
  }

  /**
   * Get event by ID
   * Requires read:events permission
   */
  @Public()
  @Get('public/:id')
  @ApiOperation({ summary: 'Get public event by ID' })
  @ApiParam({ name: 'id', description: 'Event ID', type: Number })
  @ApiResponse({ status: 200, description: 'Returns public event details' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getPublicEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.get({ id });
  }

  @Public()
  @Get('public/past/:id')
  @ApiOperation({ summary: 'Get public past event by ID' })
  @ApiParam({ name: 'id', description: 'Past event ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Returns past public event details',
  })
  @ApiResponse({ status: 403, description: 'El evento no ha terminado' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getPublicPastEvent(@Param('id', ParseIntPipe) id: number) {
    const response = await this.eventsService.get({ id });
    const responseRecord = response as unknown as Record<string, unknown>;
    const eventCandidate =
      responseRecord.data ?? responseRecord.event ?? responseRecord;
    const eventRecord =
      typeof eventCandidate === 'object' && eventCandidate !== null
        ? (eventCandidate as Record<string, unknown>)
        : {};

    const statusValue = Number(eventRecord.status);
    const statusNameRaw = eventRecord.statusName;
    const statusName =
      typeof statusNameRaw === 'string' ? statusNameRaw.toUpperCase() : '';
    const closedStatusValue = Number(EventStatus.CLOSED);

    if (statusValue !== closedStatusValue && statusName !== 'CLOSED') {
      throw new ForbiddenException('El evento no ha terminado');
    }

    return response;
  }

  @RequirePermission('read:events')
  @Get(':id')
  @ApiOperation({ summary: 'Get event by ID' })
  @ApiParam({ name: 'id', description: 'Event ID', type: Number })
  @ApiResponse({ status: 200, description: 'Returns event details' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing read:events permission',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.get({ id });
  }

  /**
   * Update event
   * Requires manage:events permission
   */
  @RequirePermission('manage:events')
  @Patch(':id')
  @InvalidateCache({
    endpoints: ['/events', '/events/public', '/events/my-events'],
  })
  @ApiOperation({ summary: 'Update event details' })
  @ApiParam({ name: 'id', description: 'Event ID', type: Number })
  @ApiResponse({ status: 200, description: 'Event updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing manage:events permission',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async updateEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEventDTO: UpdateEventDTO,
  ) {
    return this.eventsService.update({ ...updateEventDTO, id });
  }

  /**
   * Delete event
   * Requires manage:events permission
   */
  @RequirePermission('manage:events')
  @Delete(':id')
  @InvalidateCache({
    endpoints: ['/events', '/events/public', '/events/my-events'],
  })
  @ApiOperation({ summary: 'Delete an event' })
  @ApiParam({ name: 'id', description: 'Event ID', type: Number })
  @ApiResponse({ status: 200, description: 'Event deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing manage:events permission',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async deleteEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.delete({ id });
  }

  // =====================
  // EVENT MEMBERS ENDPOINTS
  // =====================

  @RequirePermission('create:event-members')
  @Post('members')
  @ApiOperation({ summary: 'Create a new event member' })
  @ApiResponse({
    status: 201,
    description: 'Event member created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing create:event-members permission',
  })
  async createEventMember(@Body() createEventMemberDTO: CreateEventMemberDTO) {
    return this.eventsService.createMember(createEventMemberDTO);
  }

  @RequirePermission('delete:event-members')
  @Delete('members/delete')
  @ApiOperation({ summary: 'Delete event member' })
  @ApiResponse({
    status: 200,
    description: 'Event member deleted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing delete:event-members permission',
  })
  @ApiResponse({ status: 404, description: 'Event member not found' })
  async deleteEventMember(@Body() deleteEventMemberDTO: DeleteEventMemberDTO) {
    return this.eventsService.deleteMember(deleteEventMemberDTO);
  }

  @RequirePermission('read:event-members')
  @Get('members/:eventId')
  @ApiOperation({ summary: 'Get event members by event ID' })
  @ApiResponse({ status: 200, description: 'Returns list of event members' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing read:event-members permission',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async listEventMembers(@Query() listEventMembers: ListEventMembersDTO) {
    return this.eventsService.listMembers(listEventMembers);
  }

  @RequirePermission('read:event-members')
  @Get(':eventId/jurors')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get confirmed jurors for an event',
    description:
      'Returns the jurors who accepted their invitation to an event and their user information. Requires read:event-members permission.',
  })
  @ApiParam({ name: 'eventId', description: 'Event ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Returns confirmed jurors for the event',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Missing read:event-members permission',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async listConfirmedJurorsByEvent(
    @Param('eventId', ParseIntPipe) eventId: number,
  ) {
    return this.eventsService.listConfirmedJurorsByEvent(eventId);
  }

  @Post('courses')
  @RequirePermission('create:event-members')
  @ApiOperation({ summary: 'Create a course alias backed by categories' })
  async createCourse(@Body() dto: CreateCourseDTO) {
    return this.eventsService.createCourse(dto);
  }

  @Patch('courses/:id')
  @ApiOperation({ summary: 'Update a course alias backed by categories' })
  async updateCourse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDTO,
  ) {
    return this.eventsService.updateCourse({ ...dto, id });
  }

  @Delete('courses/:id')
  @RequirePermission('delete:event-members')
  @ApiOperation({ summary: 'Delete a course alias backed by categories' })
  async deleteCourse(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteCourse(id);
  }

  @Get('courses/event/:eventId')
  @ApiOperation({
    summary: 'List course aliases by event backed by categories',
  })
  async listCoursesByEvent(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() dto: ListCoursesByEventDTO,
  ) {
    return this.eventsService.listCoursesByEvent(eventId, dto);
  }

  @Get('courses/dropdown/:eventId')
  @ApiOperation({
    summary: 'List course aliases for dropdown backed by categories',
  })
  async listCoursesForDropdown(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() dto: ListCoursesForDropdownDTO,
  ) {
    return this.eventsService.listCoursesForDropdown({
      ...dto,
      eventId,
    });
  }

  @Get('courses/all')
  @ApiOperation({ summary: 'List all course aliases backed by categories' })
  async listAllCourses(@Query() dto: ListCoursesDTO) {
    return this.eventsService.listCourses(dto);
  }

  @Get('courses')
  @ApiOperation({ summary: 'List course aliases backed by categories' })
  async listCourses(@Query() dto: ListCoursesDTO) {
    return this.eventsService.listCourses(dto);
  }

  @Get('courses/:id')
  @ApiOperation({ summary: 'Get a course alias backed by categories' })
  async getCourse(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getCourse(id);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a category for an event' })
  async createCategory(@Body() dto: CreateCategoryDTO) {
    return this.eventsService.createCategory(dto);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List categories' })
  async listCategories(@Query() dto: ListCategoriesDTO) {
    return this.eventsService.listCategories(dto);
  }

  @Get('categories/event/:eventId')
  @ApiOperation({ summary: 'List categories by event' })
  async listCategoriesByEvent(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() dto: ListCategoriesDTO,
  ) {
    return this.eventsService.listCategoriesByEvent(eventId, dto);
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get category by id' })
  async getCategory(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getCategory(id);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  async updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDTO,
  ) {
    return this.eventsService.updateCategory({ ...dto, id });
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category' })
  async deleteCategory(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteCategory(id);
  }

  @Post('category-awards')
  @ApiOperation({ summary: 'Create category award' })
  async createCategoryAward(@Body() dto: CreateCategoryAwardDTO) {
    return this.eventsService.createCategoryAward(dto);
  }

  @Get('category-awards')
  @ApiOperation({ summary: 'List category awards' })
  async listCategoryAwards(@Query() dto: ListCategoryAwardsDTO) {
    return this.eventsService.listCategoryAwards(dto);
  }

  @Get('category-awards/:id')
  @ApiOperation({ summary: 'Get category award by id' })
  async getCategoryAward(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getCategoryAward(id);
  }

  @Patch('category-awards/:id')
  @ApiOperation({ summary: 'Update category award' })
  async updateCategoryAward(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryAwardDTO,
  ) {
    return this.eventsService.updateCategoryAward({ ...dto, id });
  }

  @Delete('category-awards/:id')
  @ApiOperation({ summary: 'Delete category award' })
  async deleteCategoryAward(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteCategoryAward(id);
  }

  @Post('award-winners')
  @ApiOperation({ summary: 'Create award winner' })
  async createAwardWinner(@Body() dto: CreateAwardWinnerDTO) {
    return this.eventsService.createAwardWinner(dto);
  }

  @Get('award-winners')
  @ApiOperation({ summary: 'List award winners' })
  async listAwardWinners(@Query() dto: ListAwardWinnersDTO) {
    return this.eventsService.listAwardWinners(dto);
  }

  @Get('award-winners/:id')
  @ApiOperation({ summary: 'Get award winner by id' })
  async getAwardWinner(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getAwardWinner(id);
  }

  @Patch('award-winners/:id')
  @ApiOperation({ summary: 'Update award winner' })
  async updateAwardWinner(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAwardWinnerDTO,
  ) {
    return this.eventsService.updateAwardWinner({ ...dto, id });
  }

  @Delete('award-winners/:id')
  @ApiOperation({ summary: 'Delete award winner' })
  async deleteAwardWinner(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteAwardWinner(id);
  }

  @Post('inscription-details')
  @ApiOperation({ summary: 'Create inscription detail' })
  async createEventInscriptionDetail(
    @Body() dto: CreateEventInscriptionDetailDTO,
  ) {
    return this.eventsService.createEventInscriptionDetail(dto);
  }

  @Get('inscription-details')
  @ApiOperation({ summary: 'List inscription details' })
  async listEventInscriptionDetails(
    @Query() dto: ListEventInscriptionDetailsDTO,
  ) {
    return this.eventsService.listEventInscriptionDetails(dto);
  }

  @Get('inscription-details/:id')
  @ApiOperation({ summary: 'Get inscription detail by id' })
  async getEventInscriptionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getEventInscriptionDetail(id);
  }

  @Patch('inscription-details/:id')
  @ApiOperation({ summary: 'Update inscription detail' })
  async updateEventInscriptionDetail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventInscriptionDetailDTO,
  ) {
    return this.eventsService.updateEventInscriptionDetail({ ...dto, id });
  }

  @Delete('inscription-details/:id')
  @ApiOperation({ summary: 'Delete inscription detail' })
  async deleteEventInscriptionDetail(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteEventInscriptionDetail(id);
  }

  @Post('recaps')
  @ApiOperation({ summary: 'Create event recap' })
  async createEventRecap(@Body() dto: CreateEventRecapDTO) {
    return this.eventsService.createEventRecap(dto);
  }

  @Get('recaps')
  @ApiOperation({ summary: 'List event recaps' })
  async listEventRecaps(@Query() dto: ListEventRecapsDTO) {
    return this.eventsService.listEventRecaps(dto);
  }

  @Get('recaps/:id')
  @ApiOperation({ summary: 'Get event recap by id' })
  async getEventRecap(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getEventRecap(id);
  }

  @Patch('recaps/:id')
  @ApiOperation({ summary: 'Update event recap' })
  async updateEventRecap(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventRecapDTO,
  ) {
    return this.eventsService.updateEventRecap({ ...dto, id });
  }

  @Delete('recaps/:id')
  @ApiOperation({ summary: 'Delete event recap' })
  async deleteEventRecap(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteEventRecap(id);
  }

  // =====================
  // RANKING EVENT ENDPOINTS
  // =====================

  @RequirePermission('manage:events')
  @Post('ranking-config')
  @ApiOperation({ summary: 'Create ranking configuration for an event' })
  @ApiResponse({ status: 201, description: 'Ranking configuration created' })
  @ApiResponse({ status: 409, description: 'Ranking config already exists for this event' })
  async createRankingEvent(@Body() dto: CreateRankingEventDTO) {
    return this.eventsService.createRankingEvent(dto);
  }

  @Public()
  @Get('ranking-config/by-event/:eventId')
  @ApiOperation({ summary: 'Get ranking configuration by event ID' })
  @ApiParam({ name: 'eventId', description: 'Event ID', type: Number })
  @ApiResponse({ status: 200, description: 'Returns ranking configuration' })
  @ApiResponse({ status: 404, description: 'Ranking configuration not found' })
  async getRankingEventByEventId(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.eventsService.getRankingEventByEventId(eventId);
  }

  @RequirePermission('read:events')
  @Get('ranking-config/:id')
  @ApiOperation({ summary: 'Get ranking configuration by ID' })
  @ApiParam({ name: 'id', description: 'Ranking config ID', type: Number })
  @ApiResponse({ status: 200, description: 'Returns ranking configuration' })
  @ApiResponse({ status: 404, description: 'Ranking configuration not found' })
  async getRankingEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.getRankingEvent(id);
  }

  @RequirePermission('manage:events')
  @Patch('update-ranking-config/:id')
  @ApiOperation({ summary: 'Update ranking configuration' })
  @ApiParam({ name: 'id', description: 'Ranking config ID', type: Number })
  @ApiResponse({ status: 200, description: 'Ranking configuration updated' })
  @ApiResponse({ status: 404, description: 'Ranking configuration not found' })
  async updateRankingEvent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRankingEventDTO,
  ) {
    return this.eventsService.updateRankingEvent(id, dto);
  }

  @RequirePermission('manage:events')
  @Delete('ranking-config/:id')
  @ApiOperation({ summary: 'Delete ranking configuration' })
  @ApiParam({ name: 'id', description: 'Ranking config ID', type: Number })
  @ApiResponse({ status: 200, description: 'Ranking configuration deleted' })
  @ApiResponse({ status: 404, description: 'Ranking configuration not found' })
  async deleteRankingEvent(@Param('id', ParseIntPipe) id: number) {
    return this.eventsService.deleteRankingEvent(id);
  }

  @RequirePermission('read:grades')
  @Get(':eventId/rankings')
  @ApiOperation({
    summary: 'Get full ranking report (admin)',
    description:
      'Returns full ranking report for an event with optional category filter in json or excel format.',
  })
  @ApiParam({ name: 'eventId', description: 'Event ID', type: Number })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Optional category (degree/course) filter',
    example: 3,
  })
  @ApiQuery({
    name: 'category_id',
    required: false,
    type: Number,
    description: 'Alias for categoryId',
    example: 3,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: RankingReportFormat,
    description: 'Response format. Use excel for downloadable XLSX file',
    example: RankingReportFormat.JSON,
  })
  @ApiResponse({
    status: 200,
    description: 'Ranking report generated (JSON)',
    content: {
      'application/json': {
        examples: {
          adminRankingJson: {
            summary: 'Admin JSON response',
            value: {
              eventId: 10,
              eventName: 'Hackathon 2026',
              scope: 'admin',
              categoryId: 3,
              configuration: {
                visiblePublic: true,
                positions: 10,
                gradeVisible: true,
              },
              items: [
                {
                  projectId: 42,
                  projectName: 'EcoVision',
                  participantNames: ['Ana Perez', 'Luis Ramos'],
                  categoryId: 3,
                  category: 'Ingenieria de Sistemas',
                  position: 1,
                  individualGrades: [19.2, 18.7, 19.8],
                  averageGrade: 19.23,
                },
                {
                  projectId: 51,
                  projectName: 'CivicFlow',
                  participantNames: ['Maria Soto', 'Diego Leon'],
                  categoryId: 3,
                  category: 'Ingenieria de Sistemas',
                  position: 2,
                  individualGrades: [18.4, 18.8, 18.5],
                  averageGrade: 18.57,
                },
              ],
            },
          },
        },
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    headers: {
      'Content-Disposition': {
        description:
          'Present when format=excel. Example: attachment; filename="ranking-event-10-admin.xlsx"',
        schema: {
          type: 'string',
        },
      },
    },
  })
  /**
   * Admin ranking report endpoint.
   *
   * Behavior:
   * - Requires admin-level permission.
   * - Returns full ranking rows without public visibility restrictions.
   * - Supports JSON payload or downloadable XLSX output.
   */
  async getAdminRankingReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: GetRankingReportDto,
    @Res() response: Response,
  ) {
    const report = await this.eventsService.generateRankingReport(
      eventId,
      query,
      'admin',
    );

    if (query.format === RankingReportFormat.EXCEL) {
      const buffer = await this.eventsService.generateRankingExcelBuffer(report);
      const fileName = this.buildRankingFileName(report, 'admin');

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      response.send(buffer);
      return;
    }

    response.json(report);
  }

  @Public()
  @Get(':eventId/rankings/public')
  @ApiOperation({
    summary: 'Get public ranking report',
    description:
      'Returns public ranking report, respecting ranking visibility, positions limit, and grade visibility in json or excel format.',
  })
  @ApiParam({ name: 'eventId', description: 'Event ID', type: Number })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Optional category (degree/course) filter',
    example: 3,
  })
  @ApiQuery({
    name: 'category_id',
    required: false,
    type: Number,
    description: 'Alias for categoryId',
    example: 3,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: RankingReportFormat,
    description: 'Response format. Use excel for downloadable XLSX file',
    example: RankingReportFormat.JSON,
  })
  @ApiResponse({
    status: 200,
    description: 'Public ranking report generated (JSON or Excel)',
    content: {
      'application/json': {
        examples: {
          publicRankingJsonVisibleGrades: {
            summary: 'Public JSON (grades visible)',
            value: {
              eventId: 10,
              eventName: 'Hackathon 2026',
              scope: 'public',
              categoryId: 3,
              configuration: {
                visiblePublic: true,
                positions: 3,
                gradeVisible: true,
              },
              items: [
                {
                  projectId: 42,
                  projectName: 'EcoVision',
                  participantNames: ['Ana Perez', 'Luis Ramos'],
                  categoryId: 3,
                  category: 'Ingenieria de Sistemas',
                  position: 1,
                  individualGrades: [19.2, 18.7, 19.8],
                  averageGrade: 19.23,
                },
                {
                  projectId: 51,
                  projectName: 'CivicFlow',
                  participantNames: ['Maria Soto', 'Diego Leon'],
                  categoryId: 3,
                  category: 'Ingenieria de Sistemas',
                  position: 2,
                  individualGrades: [18.4, 18.8, 18.5],
                  averageGrade: 18.57,
                },
              ],
            },
          },
          publicRankingJsonHiddenGrades: {
            summary: 'Public JSON (grades hidden)',
            value: {
              eventId: 10,
              eventName: 'Hackathon 2026',
              scope: 'public',
              categoryId: 3,
              configuration: {
                visiblePublic: true,
                positions: 3,
                gradeVisible: false,
              },
              items: [
                {
                  projectId: 42,
                  projectName: 'EcoVision',
                  participantNames: ['Ana Perez', 'Luis Ramos'],
                  categoryId: 3,
                  category: 'Ingenieria de Sistemas',
                  position: 1,
                },
                {
                  projectId: 51,
                  projectName: 'CivicFlow',
                  participantNames: ['Maria Soto', 'Diego Leon'],
                  categoryId: 3,
                  category: 'Ingenieria de Sistemas',
                  position: 2,
                },
              ],
            },
          },
        },
      },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    headers: {
      'Content-Disposition': {
        description:
          'Present when format=excel. Example: attachment; filename="ranking-event-10-public.xlsx"',
        schema: {
          type: 'string',
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Public ranking is not enabled' })
  /**
   * Public ranking report endpoint.
   *
   * Behavior:
   * - Anonymous access is allowed.
   * - Enforces RankingConfiguration visibility rules.
   * - Applies position limits and grade visibility before responding.
   * - Supports JSON payload or downloadable XLSX output.
   */
  async getPublicRankingReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: GetRankingReportDto,
    @Res() response: Response,
  ) {
    const report = await this.eventsService.generateRankingReport(
      eventId,
      query,
      'public',
    );

    if (query.format === RankingReportFormat.EXCEL) {
      const buffer = await this.eventsService.generateRankingExcelBuffer(report);
      const fileName = this.buildRankingFileName(report, 'public');

      response.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`,
      );
      response.send(buffer);
      return;
    }

    response.json(report);
  }

  @Get(':id/my-project')
  @ApiOperation({ summary: 'Get my project for event' })
  @ApiResponse({
    status: 200,
    description: "Returns user's project for the specified event",
  })
  @ApiResponse({
    status: 404,
    description: 'No project found for this user in the specified event',
  })
  async getMyProjectForEvent(
    @Param('id', ParseIntPipe) eventId: number,
    @GetUser('id') userId: number,
  ) {
    return this.eventsService.getMyProjectForEvent(userId, eventId);
  }
}
