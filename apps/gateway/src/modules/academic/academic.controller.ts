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
  AcademicProfileQueryDto,
  GetAcademicGradesDto,
  ListAcademicProjectsDto,
} from './dto/academic-query.dto';
import { buildGradesBuffer, gradesFileName } from './academic-grades.workbook';
import { AcademicProjectDetail, GradesReport } from './academic.types';
import { AcademicProfile } from './academic-profiles';

/**
 * Read-only endpoints of the academic roles (CU-86e3vmz0m). /profiles lists the academic
 * profiles of the caller (one per role: Professor, Tutor, DepartmentDirector, Dean); every
 * other endpoint requires `read:academic_projects` and a `profile` the caller holds (403
 * otherwise), and reads only the scope of that profile: PROFESSOR their course sections,
 * TUTOR their tutored projects, DIRECTOR their department, DEAN all. Nothing here writes.
 */
@ApiTags('academic')
@ApiSecurity('JWT-auth')
@ApiBearerAuth()
@Controller('academic')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Get('profiles')
  @ApiOperation({
    summary: 'My academic profiles',
    description:
      'One profile per academic platform role of the caller, in this order: PROFESSOR ' +
      '(Professor), TUTOR (Tutor), DIRECTOR (DepartmentDirector), DEAN (Dean). Empty for ' +
      'a user without them (students, Admin and FacultyAdmin included). Only needs a ' +
      'session. Each one is a valid `profile` for the other /academic endpoints.',
  })
  @ApiResponse({
    status: 200,
    description:
      'The profiles, such as ["PROFESSOR", "TUTOR"]; [] without academic roles',
    schema: {
      type: 'array',
      items: { type: 'string', enum: Object.values(AcademicProfile) },
    },
  })
  listProfiles(@GetUser() user: AppUser): AcademicProfile[] {
    return this.academicService.listProfiles(user);
  }

  @Get('projects')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'Projects of my academic scope',
    description:
      'Paginated projects the caller may read, with description, review state, documents, ' +
      'participants, tutors and course section (NRC). Filters by event, state, course section and name.',
  })
  @ApiResponse({ status: 200, description: 'Page of projects' })
  @ApiResponse({
    status: 403,
    description:
      'The user lacks read:academic_projects or the role of the profile',
  })
  listProjects(
    @GetUser() user: AppUser,
    @Query() query: ListAcademicProjectsDto,
  ) {
    return this.academicService.listProjects(user, query);
  }

  @Get('projects/:id')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'One project of my academic scope, with its evaluation',
    description:
      'The project (as in the list) plus `evaluation`: gradeStatus PENDING, PRELIMINARY or ' +
      'OFFICIAL, assigned jurors and how many evaluated (always sent), and, when the caller ' +
      'may see the grade, the result (final grade, maxScore, criteria by component with ' +
      'their effective weights as fractions, the jurors comments without author) and the ' +
      'position in the ranking of its category with its published awards (tied projects share it; null if the project ' +
      'is not approved or the event has no ranking). Without read:grades the result and ' +
      'the position are only sent once the results are published (resultHidden: true until then). ' +
      '`evaluation` is null when the evaluation could not be read; the project is still sent.',
  })
  @ApiResponse({ status: 200, description: 'The project and its evaluation' })
  @ApiResponse({
    status: 403,
    description:
      'The user lacks read:academic_projects or the role of the profile',
  })
  @ApiResponse({
    status: 404,
    description: 'The project does not exist or is outside the caller scope',
  })
  getProject(
    @GetUser() user: AppUser,
    @Param('id', ParseIntPipe) projectId: number,
    @Query() query: AcademicProfileQueryDto,
  ): Promise<AcademicProjectDetail> {
    return this.academicService.getProject(user, projectId, query.profile);
  }

  @Get('projects/:id/diploma')
  @RequirePermission('read:academic_projects')
  @ApiOperation({
    summary: 'Download the award diploma of one project of my academic scope',
    description:
      'Same PDF the students of the project download. Only for the profiles DIRECTOR ' +
      '(their department) and DEAN (all), once the results of the event are published ' +
      'and only if the project won at least one award.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The PDF file' })
  @ApiResponse({
    status: 403,
    description:
      'The user lacks read:academic_projects or the role of the profile, the profile is ' +
      'not DIRECTOR or DEAN, or the results of the event are not published yet',
  })
  @ApiResponse({
    status: 404,
    description:
      'The project does not exist or is outside the caller scope, it won no award, or ' +
      'the event has no diploma design',
  })
  async getDiploma(
    @GetUser() user: AppUser,
    @Param('id', ParseIntPipe) projectId: number,
    @Query() query: AcademicProfileQueryDto,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.academicService.getDiploma(
      user,
      projectId,
      query.profile,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
      length: buffer.length,
    });
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
  @ApiResponse({
    status: 403,
    description:
      'The user lacks read:academic_projects or the role of the profile',
  })
  listEvents(
    @GetUser() user: AppUser,
    @Query() query: AcademicProfileQueryDto,
  ) {
    return this.academicService.listEvents(user, query.profile);
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
  @ApiResponse({
    status: 403,
    description:
      'The user lacks read:academic_projects or the role of the profile',
  })
  @ApiResponse({ status: 404, description: 'The event does not exist' })
  getRegistrations(
    @GetUser() user: AppUser,
    @Query() query: AcademicEventQueryDto,
  ) {
    return this.academicService.getRegistrations(
      user,
      query.eventId,
      query.profile,
    );
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
  @ApiResponse({
    status: 403,
    description:
      'The user lacks read:academic_projects or the role of the profile',
  })
  @ApiResponse({ status: 404, description: 'The event does not exist' })
  async getGrades(
    @GetUser() user: AppUser,
    @Query() query: GetAcademicGradesDto,
  ): Promise<GradesReport | StreamableFile> {
    const report = await this.academicService.getGrades(
      user,
      query.eventId,
      query.profile,
    );
    if (query.format !== AcademicGradesFormat.EXCEL) return report;
    return xlsxFile(await buildGradesBuffer(report), gradesFileName(report));
  }
}
