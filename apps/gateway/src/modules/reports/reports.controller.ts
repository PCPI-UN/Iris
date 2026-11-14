import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { EvaluationReportService } from './evaluation-report.service';
import { buildEvaluationReportBuffer } from './evaluation-report.workbook';
import {
  EvaluationReportFormat,
  GetEvaluationReportDto,
} from './dto/get-evaluation-report.dto';
import { EvaluationReport } from './evaluation-report.types';

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Lowercase ASCII words joined with "_", safe for a file name */
export function toFilePart(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'general';
}

export function evaluationReportFileName(report: EvaluationReport): string {
  return `reporte_evaluacion_${toFilePart(report.categoryName)}_${toFilePart(report.eventName)}.xlsx`;
}

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
  @ApiProduces(XLSX_TYPE, 'application/json')
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
    @Res() response: Response,
  ) {
    const report = await this.evaluationReportService.build(
      eventId,
      query.categoryId,
    );

    if (query.format === EvaluationReportFormat.JSON) {
      response.json(report);
      return;
    }

    const buffer = await buildEvaluationReportBuffer(report);
    response.setHeader('Content-Type', XLSX_TYPE);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${evaluationReportFileName(report)}"`,
    );
    response.send(buffer);
  }
}
