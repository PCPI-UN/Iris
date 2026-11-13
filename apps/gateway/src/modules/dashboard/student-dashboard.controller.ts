import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AppUser } from '../auth/types/app-user.type';
import { StudentDashboardService } from './student-dashboard.service';
import { StudentDashboardResponse } from './dto/student-dashboard.response';

/**
 * Student dashboard.
 *
 * Access: any authenticated user (no permission). The data always belongs to the caller:
 * the user comes from the session, never from the URL, the query or the body, so a
 * student cannot read another student's dashboard.
 */
@ApiTags('dashboard')
@ApiSecurity('JWT-auth')
@Controller('students/me')
export class StudentDashboardController {
  constructor(
    private readonly studentDashboardService: StudentDashboardService,
  ) {}

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my student dashboard',
    description:
      'Profile, accumulated KPIs (fairs, approved projects, awards), the project of the event that has not ended and the history of approved participations of the authenticated student. ' +
      'Awards and scores are only sent once the admin publishes the event results. Certificates are not included yet.',
  })
  @ApiResponse({ status: 200, type: StudentDashboardResponse })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  getMyDashboard(@GetUser() user: AppUser) {
    return this.studentDashboardService.getDashboard(user);
  }
}
