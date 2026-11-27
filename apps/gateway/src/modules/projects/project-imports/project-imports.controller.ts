import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
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
import { ProjectImportsService } from './project-imports.service';
import {
  PROJECT_IMPORT_MAX_BYTES,
  PROJECT_IMPORT_MAX_ROWS,
  PROJECT_IMPORT_SHEET,
} from './project-import-format';

const FILE_BODY = (description: string) => ({
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary', description } },
  },
});

const ROW_FIELDS =
  'Each row carries rowNumber, outcome, message (Spanish), projectName, categoryName, state, ' +
  'participants (email and HAS_ACCOUNT or NO_ACCOUNT) and projectId';

@ApiTags('project-imports')
@ApiSecurity('JWT-auth')
@Controller('events/:eventId/project-imports')
export class ProjectImportsController {
  constructor(private readonly projectImportsService: ProjectImportsService) {}

  @RequirePermission('manage:projects')
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PROJECT_IMPORT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Preview a project import from the template',
    description:
      `Reads the "${PROJECT_IMPORT_SHEET}" sheet (one project per row, with up to 6 students and 2 tutors) ` +
      'and reports, row by row, what confirming would do. Nothing is written and no email is sent. ' +
      `Only .xlsx, up to ${PROJECT_IMPORT_MAX_BYTES / (1024 * 1024)} MB and ${PROJECT_IMPORT_MAX_ROWS} rows.`,
  })
  @ApiParam({ name: 'eventId', type: Number, example: 1 })
  @ApiBody(FILE_BODY('Filled project template (.xlsx)'))
  @ApiResponse({
    status: 200,
    description:
      `Result per row (CREATE, SKIP when the project already exists in the event and category, or ERROR), ` +
      `totals, event warnings and canConfirm. ${ROW_FIELDS}`,
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
    return this.projectImportsService.preview(eventId, file);
  }

  @RequirePermission('manage:projects')
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PROJECT_IMPORT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Execute a project import after its preview',
    description:
      'Send the same file of the preview once the person confirms it. The file is validated again: ' +
      'if the preview cannot be confirmed nothing is created and the answer is a 400 with the preview in details.preview. ' +
      'Otherwise the projects are created one row at a time, even after the inscription deadline; ' +
      'projects already in the event are skipped, so nothing is duplicated. A row that fails at creation ' +
      '(a student joined another project meanwhile) is reported as an error and the others are created anyway. ' +
      'Documents are not part of the import: they are uploaded later from the project.',
  })
  @ApiParam({ name: 'eventId', type: Number, example: 1 })
  @ApiBody(
    FILE_BODY('The same filled project template sent to the preview (.xlsx)'),
  )
  @ApiResponse({
    status: 200,
    description:
      'Result per row (CREATED, SKIP or ERROR, with failedEffects when some work in other services failed) ' +
      `and totals (created, skipped, errors, emailsSent, failedEffects). ${ROW_FIELDS}`,
  })
  @ApiResponse({
    status: 400,
    description:
      'Missing or invalid file, or a preview that cannot be confirmed (body: message and details.preview)',
  })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 413, description: 'File larger than the limit' })
  execute(
    @Param('eventId', ParseIntPipe) eventId: number,
    @GetUser() user: AppUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.projectImportsService.execute(eventId, file, user.id);
  }

  @RequirePermission('manage:projects')
  @Get('template')
  @ApiProduces(XLSX_CONTENT_TYPE)
  @ApiOperation({
    summary: 'Download the project template of an event',
    description:
      `Excel template to fill the "${PROJECT_IMPORT_SHEET}" sheet: the categories of the event, the state, ` +
      'the semester and the career as dropdowns, and NRC required only when the event requires a course section.',
  })
  @ApiParam({ name: 'eventId', type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'The .xlsx template' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async template(
    @Param('eventId', ParseIntPipe) eventId: number,
  ): Promise<StreamableFile> {
    const { fileName, file } =
      await this.projectImportsService.template(eventId);
    return xlsxFile(file, fileName);
  }
}
