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
import { GetUser } from '../../../common/decorators/get-user.decorator';
import { AppUser } from '../../auth/types/app-user.type';
import { XLSX_CONTENT_TYPE, xlsxFile } from '../../../common/excel/xlsx-file';
import { JurorImportsService } from './juror-imports.service';
import {
  JUROR_IMPORT_MAX_BYTES,
  JUROR_IMPORT_MAX_ROWS,
  JUROR_IMPORT_SHEET,
} from './juror-import-format';

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
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: JUROR_IMPORT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Execute a juror import after its preview',
    description:
      'Send the same file of the preview once the person confirms it. The file is validated again: ' +
      'if the preview cannot be confirmed nothing is done and the answer is a 400 with the preview. ' +
      'Otherwise the jurors who are not in the event are invited (new accounts are created and receive the email), ' +
      'and every juror is assigned to their project; existing assignments are skipped, so nothing is duplicated. ' +
      'A juror whose invitation fails is reported as an error and not assigned; the others are assigned anyway.',
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
          description:
            'The same filled juror template sent to the preview (.xlsx)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'Summary: result per row (ASSIGN assigned now, SKIP already assigned, ERROR not assigned, with a message in Spanish) ' +
      'and totals (rows, assigned, skipped, errors, jurors, invitationsSent, invitationsReused, newUsers). ' +
      'invitationsReused counts jurors who already had a pending invitation: no new email was sent to them.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Missing or invalid file, or a preview that cannot be confirmed (body: message and preview). ' +
      'If the assignment is refused after the invitations went out (the event or a project changed meanwhile), ' +
      'the body is message and invitedJurors (emails already invited); running the file again is safe.',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 413, description: 'File larger than the limit' })
  execute(
    @Param('eventId', ParseIntPipe) eventId: number,
    @GetUser() user: AppUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.jurorImportsService.execute(eventId, file, user.id);
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
    return xlsxFile(file, fileName);
  }
}
