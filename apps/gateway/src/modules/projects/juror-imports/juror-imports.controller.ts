import {
  Controller,
  Get,
  StreamableFile,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { JurorImportsService } from './juror-imports.service';
import {
  JUROR_IMPORT_MAX_BYTES,
  JUROR_IMPORT_MAX_ROWS,
  JUROR_IMPORT_SHEET,
} from './juror-import-format';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('juror-imports')
@ApiSecurity('JWT-auth')
@Controller('events/:eventId/juror-imports')
export class JurorImportsController {
  constructor(private readonly jurorImportsService: JurorImportsService) {}

  @RequirePermission('manage:events')
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: JUROR_IMPORT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Preview a juror import from the PF template',
    description:
      `Reads the "${JUROR_IMPORT_SHEET}" sheet (headers found in the first rows: Departamento, Número and, per juror N, Nombre(s), Apellido(s) and Correo) ` +
      'and reports, row by row, what confirming would do. Nothing is written and no email is sent. ' +
      `Only .xlsx, up to ${JUROR_IMPORT_MAX_BYTES / (1024 * 1024)} MB and ${JUROR_IMPORT_MAX_ROWS} jurors.`,
  })
  @ApiParam({ name: 'eventId', type: Number, example: 1 })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Filled juror template (.xlsx)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Result per row (ASSIGN, SKIP or ERROR with a message in Spanish), totals, event warnings and canConfirm',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing or invalid file, sheet or columns, or too many rows',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 413, description: 'File larger than the limit' })
  preview(
    @Param('eventId', ParseIntPipe) eventId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.jurorImportsService.preview(eventId, file);
  }

  @RequirePermission('manage:events')
  @Get('template')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    summary: 'Download the juror template of an event',
    description:
      `Excel template to fill the "${JUROR_IMPORT_SHEET}" sheet: the departments of the event as a dropdown, ` +
      'its approved projects (including those without a number yet) and helper formulas that flag errors before uploading.',
  })
  @ApiParam({ name: 'eventId', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'The .xlsx template' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async template(
    @Param('eventId', ParseIntPipe) eventId: number,
  ): Promise<StreamableFile> {
    const { fileName, file } = await this.jurorImportsService.template(eventId);
    return new StreamableFile(file, {
      type: XLSX_CONTENT_TYPE,
      disposition: `attachment; filename="${fileName}"`,
      length: file.length,
    });
  }
}
