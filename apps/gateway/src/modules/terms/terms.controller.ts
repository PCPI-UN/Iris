import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { EventService } from '../events/events.service';
import { CreateTermDto } from './dto/create-term.dto';

/**
 * Academic terms (CU-86e3vmz0m). Every event belongs to one; the NRC a student types when
 * submitting a project is looked up in the term of the event.
 */
@ApiTags('terms')
@ApiSecurity('JWT-auth')
@ApiBearerAuth()
@Controller('terms')
export class TermsController {
  constructor(private readonly eventsService: EventService) {}

  @Get()
  @RequirePermission('read:events')
  @ApiOperation({ summary: 'Academic terms an event can be created or edited with, newest first' })
  @ApiResponse({ status: 200, description: 'List of terms: id, year and period' })
  listTerms() {
    return this.eventsService.listTerms();
  }

  @Post()
  @RequirePermission('manage:events')
  @ApiOperation({ summary: 'Create an academic term' })
  @ApiResponse({ status: 201, description: 'The created term' })
  @ApiResponse({ status: 409, description: 'The term already exists' })
  createTerm(@Body() dto: CreateTermDto) {
    return this.eventsService.createTerm(dto);
  }
}
