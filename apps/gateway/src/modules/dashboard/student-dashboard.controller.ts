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
 * Student dashboard (IRIS-V3-STD-01, ClickUp 86e3vmxb0; frontend contract CU-86e3vmxb2).
 *
 * Access: any authenticated user (no permission). The data always belongs to the caller:
 * the user comes from the session, never from the URL, the query or the body, so a
 * student cannot read another student's dashboard.
 *
 * Kept apart from DashboardController (admin stats) on purpose, so it does not overlap
 * with the changes of the roles task (CU-86e3vmxav) to that controller.
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
      'Profile, accumulated KPIs (fairs, approved projects, awards), the project of the event in progress and the history of approved participations of the authenticated student. ' +
      'Scores and certificates are not included yet (task S2-10 and certificates).',
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
