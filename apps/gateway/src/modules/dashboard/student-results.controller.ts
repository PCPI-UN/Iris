import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { StudentResultsService } from './student-results.service';
import { StudentResultsResponse } from './dto/student-results.response';

/**
 * Results of the caller's project in an event.
 *
 * Access: any authenticated user (no permission). The project is always the caller's
 * one in the event, taken from the session user; only the event id comes from the URL.
 */
@ApiTags('dashboard')
@ApiSecurity('JWT-auth')
@Controller('events')
export class StudentResultsController {
  constructor(private readonly studentResultsService: StudentResultsService) {}

  @Get(':eventId/my-project/results')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get the results of my project in an event',
    description:
      'Until the admin publishes the event results it only returns { resultsPublished: false }. ' +
      'Then: average grade, average score per criterion, the jurors comments in one text and the project own position in its category. ' +
      'Never juror ids, names or how many jurors evaluated.',
  })
  @ApiResponse({ status: 200, type: StudentResultsResponse })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ApiResponse({
    status: 404,
    description: 'The user has no project in the event',
  })
  getMyResults(
    @Param('eventId', ParseIntPipe) eventId: number,
    @GetUser('id') userId: number,
  ) {
    return this.studentResultsService.getMyResults(userId, eventId);
  }
}
