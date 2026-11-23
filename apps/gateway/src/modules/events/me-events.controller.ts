import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { EventService } from './events.service';
import { ListMyEventsWithRolesDTO } from './dto/events/list-my-events-with-roles.dto';

@ApiTags('Me')
@Controller('me')
export class MeEventsController {
  constructor(private readonly eventsService: EventService) {}

  /**
   * Events of the authenticated user with every role they hold in each one.
   * Any authenticated user; no permission needed because it only returns their own data.
   */
  @Get('events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List my events with my roles',
    description:
      'Paginated events where the authenticated user is jury, participant or tutor, each with the list of roles held in it. Use status=current for the panel and status=past for the history.',
  })
  @ApiResponse({
    status: 200,
    description: 'Events with roles and pagination metadata',
    schema: {
      example: {
        events: [
          {
            id: 12,
            name: 'Feria de proyectos 2026-2',
            startDate: '2026-11-10T13:00:00.000Z',
            endDate: '2026-12-05T23:59:00.000Z',
            roles: ['JURY', 'TUTOR'],
          },
        ],
        meta: {
          total: 1,
          itemsOnCurrentPage: 1,
          itemsPerPage: 10,
          currentPage: 1,
          totalPages: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'status is missing or not current/past, or page/limit out of range' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
  async listMyEvents(
    @GetUser('id') userId: number,
    @Query() query: ListMyEventsWithRolesDTO,
  ) {
    return this.eventsService.listMyEventsWithRoles(userId, query);
  }
}
