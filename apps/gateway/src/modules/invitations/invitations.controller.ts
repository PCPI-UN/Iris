import { Body, Controller, Get, Param, Post, ParseIntPipe, Query } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { Public } from '../../common/decorators/public.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InviteJurorToEventDto } from './dto/invite-juror-to-event.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AppUser } from '../auth/types/app-user.type';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) { }

   @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my invitations',
    description: 'Retrieves a list of invitations for the currently logged-in user.',
  })
  @ApiQuery({
    name: 'status',
    description: 'Filter invitations by status (e.g., PENDING, ACCEPTED)',
    required: false,
    type: String,
    example: 'PENDING',
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of items per page',
    required: false,
    type: Number,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'List of user invitations retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  getUserInvitations(
    @GetUser() user: AppUser,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.invitationsService.getUserInvitations(user.id, status, page, limit);
  }
  
  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an invitation',
    description: 'Creates a new invitation for a user to join a platform, event, or project. The invitation is sent via email.',
  })
  @ApiResponse({
    status: 201,
    description: 'Invitation created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data (e.g., invalid email, invalid target type)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'Target not found (event or project does not exist)',
  })
  createInvitation(
    @Body() createInvitationDto: CreateInvitationDto,
    @GetUser() user: AppUser,
  ) {
    return this.invitationsService.createInvitation(createInvitationDto, user.id);
  }

  @Public()
  @Get(':token')
  @ApiOperation({
    summary: 'Get invitation by token',
    description: 'Retrieves invitation details by token. This endpoint is public and used to display invitation information before acceptance.',
  })
  @ApiParam({
    name: 'token',
    description: 'Invitation token (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation details retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Invitation not found or token invalid',
  })
  getInvitationByToken(@Param('token') token: string) {
    return this.invitationsService.getInvitationByToken(token);
  }

  @Public()
  @Post('accept')
  @ApiOperation({
    summary: 'Accept an invitation',
    description: 'Accepts an invitation by token. For new users (PENDING status), a password must be provided. For existing users (CONFIRMED status), the password is optional.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data (e.g., password required but not provided, token format invalid)',
  })
  @ApiResponse({
    status: 404,
    description: 'Invitation not found or token invalid',
  })
  @ApiResponse({
    status: 410,
    description: 'Invitation expired or already used',
  })
  acceptInvitation(@Body() acceptInvitationDto: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(acceptInvitationDto);
  }

  @Post('events/:eventId/jurors')
  @RequirePermission('manage:events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Invite a juror to an event',
    description: 'Creates an invitation for a juror to join an event. If a pending invitation already exists for the same email and event, it returns the existing invitation instead of creating a duplicate.',
  })
  @ApiParam({
    name: 'eventId',
    description: 'ID of the event to invite the juror to',
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Juror invitation created successfully or existing invitation returned',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data (e.g., invalid email format)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Event not found or Juror role not found in system',
  })
  inviteJurorToEvent(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() inviteJurorDto: InviteJurorToEventDto,
    @GetUser() user: AppUser,
  ) {
    return this.invitationsService.inviteJurorToEvent(
      eventId,
      inviteJurorDto,
      user.id,
    );
  }
  @Get('events/:eventId')
  @RequirePermission('read:invitations')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get invitations for an event',
    description: 'Retrieves a list of invitations for a specific event. Can be filtered by role (e.g., "Juror", "Participant").',
  })
  @ApiParam({
    name: 'eventId',
    description: 'ID of the event to retrieve invitations for',
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'roleId',
    description: 'Role ID to filter invitations by',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'page',
    description: 'Page number for pagination',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of items per page',
    required: false,
    type: Number,
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'List of invitations retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have read:invitations permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Event not found',
  })
  getEventInvitations(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query('roleId') roleId?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.invitationsService.getEventInvitations(eventId, roleId, page, limit);
  }

  @Post(':invitationId/resend')
  @RequirePermission('manage:events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend an invitation',
    description: 'Resends an existing invitation. The invitation must be expired or pending.',
  })
  @ApiParam({
    name: 'invitationId',
    description: 'ID of the invitation to resend',
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation resent successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not have manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Invitation not found',
  })
  resendInvitation(@Param('invitationId') invitationId: string) {
    return this.invitationsService.resendInvitation(invitationId);
  }

 
}
