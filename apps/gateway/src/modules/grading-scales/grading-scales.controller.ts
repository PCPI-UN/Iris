import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { InvalidateCache } from '../../common/cache/invalidate-cache.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { GradingScaleDto } from './dto/grading-scale.dto';
import { GradingScalesService } from './grading-scales.service';

// The scale of an event is part of the event response, so scale changes also clear the events cache
const SCALE_CACHE = { endpoints: ['/grading-scales', '/events', '/events/public', '/events/my-events'] };

@ApiTags('grading-scales')
@ApiSecurity('JWT-auth')
@Controller('grading-scales')
export class GradingScalesController {
  constructor(private readonly gradingScalesService: GradingScalesService) {}

  @Get()
  @RequirePermission('read:events')
  @ApiOperation({
    summary: 'List the grading scales',
    description:
      'Lists the catalog of 4-level grading scales: the read-only system scales first, then the ones created by users. ' +
      '`locked` tells whether a scale can still be edited or deleted.',
  })
  @ApiResponse({ status: 200, description: 'Grading scales retrieved' })
  list() {
    return this.gradingScalesService.list();
  }

  @Get(':id')
  @RequirePermission('read:events')
  @ApiOperation({ summary: 'Get a grading scale' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Grading scale retrieved' })
  @ApiResponse({ status: 404, description: 'Grading scale not found' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.gradingScalesService.get(id);
  }

  @Post()
  @RequirePermission('manage:events')
  @InvalidateCache(SCALE_CACHE)
  @ApiOperation({ summary: 'Create a grading scale', description: 'Exactly 4 levels whose points grow from level 1 to level 4.' })
  @ApiResponse({ status: 201, description: 'Grading scale created' })
  @ApiResponse({ status: 400, description: 'Invalid scale: not 4 levels, or points that do not grow' })
  @ApiResponse({ status: 403, description: 'Forbidden - Requires manage:events permission' })
  create(@Body() scale: GradingScaleDto, @GetUser('id') userId: number) {
    return this.gradingScalesService.create(scale, userId);
  }

  @Put(':id')
  @RequirePermission('manage:events')
  @InvalidateCache(SCALE_CACHE)
  @ApiOperation({
    summary: 'Edit a grading scale',
    description:
      'Replaces the name, description and levels. System scales cannot be edited, nor can a scale used by an event that already has evaluations.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Grading scale updated' })
  @ApiResponse({ status: 400, description: 'Invalid scale, system scale, or scale already used to grade evaluations' })
  @ApiResponse({ status: 404, description: 'Grading scale not found' })
  update(@Param('id', ParseIntPipe) id: number, @Body() scale: GradingScaleDto) {
    return this.gradingScalesService.update(id, scale);
  }

  @Delete(':id')
  @RequirePermission('manage:events')
  @InvalidateCache(SCALE_CACHE)
  @ApiOperation({
    summary: 'Delete a grading scale',
    description: 'System scales and scales assigned to an event cannot be deleted.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Grading scale deleted' })
  @ApiResponse({ status: 400, description: 'System scale or scale in use' })
  @ApiResponse({ status: 404, description: 'Grading scale not found' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.gradingScalesService.delete(id);
  }
}
