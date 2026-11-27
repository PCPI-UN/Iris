import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DiplomasService } from './diplomas.service';

/**
 * Award diplomas (CU-86e3wzr68). The student one only needs a session: DiplomasService
 * checks that the project is the caller's, that the results are published and that it won
 * an award. The staff one needs `manage:events` and follows the same rules.
 */
@ApiTags('diplomas')
@ApiSecurity('JWT-auth')
@Controller('events')
export class DiplomasController {
  constructor(private readonly diplomasService: DiplomasService) {}

  @Get(':eventId/my-project/diploma')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download the award diploma of my project in an event',
    description:
      'PDF generated on demand with the event design and the project name. Only for a ' +
      'project that won at least one award, once the admin publishes the results. One ' +
      'diploma per project, even with several awards.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The PDF file' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'The results of the event are not published yet',
  })
  @ApiResponse({
    status: 404,
    description:
      'The user has no project in the event, the project won no award, or the event has no diploma design',
  })
  async getMyDiploma(
    @Param('eventId', ParseIntPipe) eventId: number,
    @GetUser('id') userId: number,
  ): Promise<StreamableFile> {
    const { buffer, fileName } = await this.diplomasService.getMyDiploma(
      userId,
      eventId,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
      length: buffer.length,
    });
  }

  @Get(':eventId/projects/:projectId/diploma')
  @RequirePermission('manage:events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download the award diploma of a project of the event',
    description:
      'Same PDF the students of the project download, for the staff that manages the ' +
      'event and its awards. Only once the results are published and if the project won ' +
      'at least one award of the event.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The PDF file' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ApiResponse({
    status: 403,
    description:
      'Missing manage:events permission, or the results of the event are not published yet',
  })
  @ApiResponse({
    status: 404,
    description:
      'The project does not exist or belongs to another event, it won no award, or the event has no diploma design',
  })
  async getProjectDiploma(
    @Param('eventId', ParseIntPipe) eventId: number,
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<StreamableFile> {
    const { buffer, fileName } =
      await this.diplomasService.getEventProjectDiploma(eventId, projectId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
      length: buffer.length,
    });
  }

  @Get(':eventId/diplomas')
  @RequirePermission('manage:events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download the award diplomas of every winner of the event',
    description:
      'One PDF with one page per winning project, ordered by category and award ' +
      'position, for the staff that manages the event. Only once the results are ' +
      'published.',
  })
  @ApiProduces('application/pdf')
  @ApiResponse({ status: 200, description: 'The PDF file' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ApiResponse({
    status: 403,
    description:
      'Missing manage:events permission, or the results of the event are not published yet',
  })
  @ApiResponse({
    status: 404,
    description:
      'The event does not exist, has no diploma design or has no winners',
  })
  async getEventDiplomas(
    @Param('eventId', ParseIntPipe) eventId: number,
  ): Promise<StreamableFile> {
    const { buffer, fileName } =
      await this.diplomasService.getEventDiplomas(eventId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
      length: buffer.length,
    });
  }
}
