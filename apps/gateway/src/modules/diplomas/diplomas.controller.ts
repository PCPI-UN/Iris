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
import { DiplomasService } from './diplomas.service';

/**
 * Award diplomas (CU-86e3wzr68). Only a session in the guard: DiplomasService checks that
 * the project is the caller's, that the results are published and that it won an award.
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
}
