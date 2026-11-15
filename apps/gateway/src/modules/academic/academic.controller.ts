import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { XLSX_CONTENT_TYPE, xlsxFile } from '../../common/excel/xlsx-file';
import { AppUser } from '../auth/types/app-user.type';
import { AcademicService } from './academic.service';
import {
  AcademicEventQueryDto,
  AcademicGradesFormat,
  GetAcademicGradesDto,
  ListAcademicProjectsDto,
} from './dto/academic-query.dto';
import { buildGradesBuffer, gradesFileName } from './academic-grades.workbook';
import { GradesReport } from './academic.types';

/**
 * Read-only endpoints of the academic roles (CU-86e3vmz0m). All of them require
 * `read:academic_projects`; project-service limits the projects to the caller's scope
 * (Admin, FacultyAdmin, Dean: all; Tutor: tutored; Professor: their course sections;
 * DepartmentDirector: their department). Nothing here writes.
 */
@ApiTags('academic')
@ApiSecurity('JWT-auth')
@ApiBearerAuth()
@Controller('academic')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Get('projects')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'Projects of my academic scope',
    description:
      'Paginated projects the caller may read, with description, review state, documents, ' +
      'participants, tutors and course section (NRC). Filters by event, state, course section and name.',
  })
  @ApiResponse({ status: 200, description: 'Page of projects' })
  @ApiResponse({ status: 403, description: 'The user lacks read:academic_projects' })
  listProjects(
    @GetUser('id') userId: number,
    @Query() query: ListAcademicProjectsDto,
  ) {
    return this.academicService.listProjects(userId, query);
  }

  @Get('projects/:id')
  @RequirePermission('read:academic_projects')
  @ApiOperation({ summary: 'One project of my academic scope' })
  @ApiResponse({ status: 200, description: 'The project' })
  @ApiResponse({
    status: 404,
    description: 'The project does not exist or is outside the caller scope',
  })
  getProject(
    @GetUser('id') userId: number,
    @Param('id', ParseIntPipe) projectId: number,
  ) {
    return this.academicService.getProject(userId, projectId);
  }

  @Get('events')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'Events of my academic scope',
    description:
      'Events where at least one project of the caller scope takes part, newest first, ' +
      'with whether evaluations are open and results published.',
  })
  @ApiResponse({ status: 200, description: 'List of events' })
  listEvents(@GetUser('id') userId: number) {
    return this.academicService.listEvents(userId);
  }

  @Get('registrations')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'Registrations of my academic scope in an event',
    description:
      'Every project of the caller scope in the event with its review state (and reason), ' +
      'course section, tutors and students: confirmed, pending or invited, with code, semester and career.',
  })
  @ApiResponse({ status: 200, description: 'Projects and students, with totals' })
  @ApiResponse({ status: 404, description: 'The event does not exist' })
  getRegistrations(
    @GetUser('id') userId: number,
    @Query() query: AcademicEventQueryDto,
  ) {
    return this.academicService.getRegistrations(userId, query.eventId);
  }

  @Get('grades')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'Grades of my academic scope in an event',
    description:
      'Approved projects of the caller scope with gradeStatus PENDING (no evaluation yet), ' +
      'PRELIMINARY (evaluated, results not published) or OFFICIAL (published), and how many ' +
      'jurors evaluated. Without read:grades the grade is only sent once the results are ' +
      'published (gradeHidden: true until then), in the JSON and in the Excel.',
  })
  @ApiProduces('application/json', XLSX_CONTENT_TYPE)
  @ApiResponse({ status: 200, description: 'The grades, or the XLSX with format=excel' })
  @ApiResponse({ status: 404, description: 'The event does not exist' })
  async getGrades(
    @GetUser() user: AppUser,
    @Query() query: GetAcademicGradesDto,
  ): Promise<GradesReport | StreamableFile> {
    const report = await this.academicService.getGrades(user, query.eventId);
    if (query.format !== AcademicGradesFormat.EXCEL) return report;
    return xlsxFile(await buildGradesBuffer(report), gradesFileName(report));
  }
}
