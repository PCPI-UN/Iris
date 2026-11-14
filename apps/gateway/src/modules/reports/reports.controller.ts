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
import { EvaluationReportService } from './evaluation-report.service';
import { XLSX_CONTENT_TYPE, xlsxFile } from '../../common/excel/xlsx-file';
import {
  buildEvaluationReportBuffer,
  evaluationReportFileName,
} from './evaluation-report.workbook';
import {
  EvaluationReportFormat,
  GetEvaluationReportDto,
} from './dto/get-evaluation-report.dto';
import { EvaluationReport } from './evaluation-report.types';

/**
 * Evaluation reports (CU-86e3vmz0b, IRIS-V3-REP-01).
 *
 * Access: `read:grades`, the same as the admin ranking, since the report shows every
 * grade before the results are published. The download per user type (CU-86e3vmz0c)
 * is not part of this endpoint yet.
 */
@ApiTags('reports')
@ApiSecurity('JWT-auth')
@Controller('events')
export class ReportsController {
  constructor(
    private readonly evaluationReportService: EvaluationReportService,
  ) {}

  @Get(':eventId/reports/evaluation')
  @RequirePermission('read:grades')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Evaluation report of one category of an event',
    description:
      'Excel with the approved format: "Resumen por Proyecto" (final grade, position, jurors, ' +
      'comments) and "Detalle por Criterio" (component, weights and the jurors average per ' +
      'criterion). Tied projects share the position. format=json returns the same data.',
  })
  @ApiProduces(XLSX_CONTENT_TYPE, 'application/json')
  @ApiResponse({
    status: 200,
    description: 'The XLSX file, or the report data with format=json',
  })
  @ApiResponse({ status: 400, description: 'categoryId is missing or invalid' })
  @ApiResponse({ status: 403, description: 'The user lacks read:grades' })
  @ApiResponse({
    status: 404,
    description: 'The event or the category of the event does not exist',
  })
  async getEvaluationReport(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Query() query: GetEvaluationReportDto,
  ): Promise<EvaluationReport | StreamableFile> {
    const report = await this.evaluationReportService.build(
      eventId,
      query.categoryId,
    );

    if (query.format === EvaluationReportFormat.JSON) return report;
    return xlsxFile(
      await buildEvaluationReportBuffer(report),
      evaluationReportFileName(report),
    );
  }
}
