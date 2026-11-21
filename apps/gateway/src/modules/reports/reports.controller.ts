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
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AppUser } from '../auth/types/app-user.type';
import { EvaluationReportService } from './evaluation-report.service';
import { XLSX_CONTENT_TYPE, xlsxFile } from '../../common/excel/xlsx-file';
import {
  buildEvaluationReportBuffer,
  evaluationReportFileName,
} from './evaluation-report.workbook';
import {
  EvaluationReportFormat,
  GetEvaluationReportDto,
  GetMyProjectReportDto,
} from './dto/get-evaluation-report.dto';
import { EvaluationReport } from './evaluation-report.types';

/**
 * Evaluation reports (CU-86e3vmz0b, IRIS-V3-REP-01) and who downloads them (CU-86e3vmz0c).
 *
 * Both endpoints only ask for a session; EvaluationReportService decides the rows:
 * - `read:grades` (Admin, EventManager, FacultyAdmin, Dean): the whole category, always.
 * - `read:academic_projects` (Tutor, Professor, DepartmentDirector): the projects of their
 *   scope in the category, resolved by project-service, once the results are published.
 * - Anyone else gets 403 on the category report; a student downloads only their own
 *   project with `my-project/report`, once published and without the number of jurors.
 */
@ApiTags('reports')
@ApiSecurity('JWT-auth')
@Controller('events')
export class ReportsController {
  constructor(
    private readonly evaluationReportService: EvaluationReportService,
  ) {}

  @Get(':eventId/reports/evaluation')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Evaluation report of one category of an event',
    description:
      'Excel with the approved format: "Resumen por Proyecto" (final grade, position, jurors, ' +
      'comments) and "Detalle por Criterio" (component, weights and the jurors average per ' +
      'criterion). Tied projects share the position. format=json returns the same data. ' +
      'Users with read:grades get every project at any time; Tutor, Professor and ' +
      'DepartmentDirector only the projects of their scope, once the results are published.',
  })
  @ApiProduces(XLSX_CONTENT_TYPE, 'application/json')
  @ApiResponse({
    status: 200,
    description: 'The XLSX file, or the report data with format=json',
  })
  @ApiResponse({ status: 400, description: 'categoryId is missing or invalid' })
  @ApiResponse({
    status: 403,
    description:
      'The user has neither read:grades nor read:academic_projects, or the results are not published yet',
  })
  @ApiResponse({
    status: 404,
    description:
      'The event or the category of the event does not exist, or the user has no projects in it',
  })
  async getEvaluationReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: GetEvaluationReportDto,
    @GetUser() user: AppUser,
  ): Promise<EvaluationReport | StreamableFile> {
    const report = await this.evaluationReportService.buildForUser(
      user,
      eventId,
      query.categoryId,
    );
    return this.respond(report, query.format);
  }

  @Get(':eventId/my-project/report')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Evaluation report of my project in an event',
    description:
      'The same format as the category report with only the caller project, once the admin ' +
      'publishes the results. It never shows how many jurors evaluated.',
  })
  @ApiProduces(XLSX_CONTENT_TYPE, 'application/json')
  @ApiResponse({
    status: 200,
    description: 'The XLSX file, or the report data with format=json',
  })
  @ApiResponse({
    status: 403,
    description: 'The results of the event are not published yet',
  })
  @ApiResponse({
    status: 404,
    description:
      'The user has no project in the event, or it is not part of the results',
  })
  async getMyProjectReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: GetMyProjectReportDto,
    @GetUser('id') userId: number,
  ): Promise<EvaluationReport | StreamableFile> {
    const report = await this.evaluationReportService.buildForStudent(
      userId,
      eventId,
    );
    return this.respond(report, query.format);
  }

  private async respond(
    report: EvaluationReport,
    format: EvaluationReportFormat | undefined,
  ): Promise<EvaluationReport | StreamableFile> {
    if (format === EvaluationReportFormat.JSON) return report;
    return xlsxFile(
      await buildEvaluationReportBuffer(report),
      evaluationReportFileName(report),
    );
  }
}
