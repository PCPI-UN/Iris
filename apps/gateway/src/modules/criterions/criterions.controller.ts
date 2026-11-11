import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CriterionsService } from './criterions.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';
import { ListCriterionsDto } from './dto/list-criterions.dto';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';
import { RequirePermission } from '@common/decorators/require-permission.decorator';
import { InvalidateCache } from '@common/cache/invalidate-cache.decorator';

@ApiTags('criterions')
@ApiSecurity('JWT-auth')
@Controller('criterions')
export class CriterionsController {
  constructor(private readonly criterionsService: CriterionsService) {}

  // =========================================================
  // COMPONENT ENDPOINTS
  // =========================================================

  @Post('components')
  @RequirePermission('manage:events')
  @InvalidateCache({
    endpoints: ['/criterions/components', '/api/criterions/components'],
  })
  @ApiOperation({
    summary: 'Create a new component',
    description:
      'Creates a new evaluation component with a name and weight. Requires EventManager role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Component created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  async createComponent(@Body() createComponentDto: CreateComponentDto) {
    return this.criterionsService.createComponent(createComponentDto);
  }

  @Get('components')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'List all components',
    description:
      'Retrieves a list of all evaluation components.',
  })
  @ApiResponse({
    status: 200,
    description: 'Components retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  async listComponents() {
    return this.criterionsService.listComponents();
  }

  @Get('components/:id')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Get component by ID',
    description:
      'Retrieves details of a specific component.',
  })
  @ApiParam({
    name: 'id',
    description: 'Component ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Component retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Component not found',
  })
  async getComponent(@Param('id', ParseIntPipe) id: number) {
    return this.criterionsService.getComponent(id);
  }

  @Put('components/:id')
  @RequirePermission('manage:events')
  @InvalidateCache({
    endpoints: ['/criterions/components', '/api/criterions/components'],
  })
  @ApiOperation({
    summary: 'Update a component',
    description:
      'Updates component name and/or weight. Requires EventManager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Component ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Component updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Component not found',
  })
  async updateComponent(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateComponentDto: UpdateComponentDto,
  ) {
    return this.criterionsService.updateComponent(id, updateComponentDto);
  }

  @Delete('components/:id')
  @RequirePermission('manage:events')
  @InvalidateCache({
    endpoints: ['/criterions/components', '/api/criterions/components'],
  })
  @ApiOperation({
    summary: 'Delete a component',
    description:
      'Deletes a component. Requires EventManager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Component ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Component deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Component not found',
  })
  async deleteComponent(@Param('id', ParseIntPipe) id: number) {
    return this.criterionsService.deleteComponent(id);
  }

  // =========================================================
  // CRITERION ENDPOINTS
  // =========================================================

  @Post()
  @RequirePermission('manage:events')
  @InvalidateCache({
    endpoints: ['/criterions', '/api/criterions'],
  })
  @ApiOperation({
    summary: 'Create a new criterion',
    description:
      'Creates a new evaluation criterion and associates it with specified courses. Requires EventManager role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Criterion created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  async createCriterion(@Body() createCriterionDto: CreateCriterionDto) {
    return this.criterionsService.createCriterion(createCriterionDto);
  }

  @Get()
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'List criterions with pagination and filters',
    description:
      'Retrieves a paginated list of criterions. Can be filtered by eventId or courseId.',
  })
  @ApiResponse({
    status: 200,
    description: 'Criterions retrieved successfully with pagination metadata',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  async listCriterions(@Query() query: ListCriterionsDto) {
    return this.criterionsService.listCriterions(query);
  }

  @Get('readiness')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Check whether the rubric of an event can be evaluated',
    description:
      'For each category (course) of the event, tells whether its rubric is ready: the event components ' +
      'add up to 100% and every component has at least one criterion of that category. ' +
      'Evaluations of a category whose rubric is not ready are rejected.',
  })
  @ApiQuery({ name: 'eventId', type: Number, example: 1 })
  @ApiQuery({
    name: 'courseId',
    type: Number,
    required: false,
    description: 'Only return this category',
  })
  @ApiResponse({ status: 200, description: 'Rubric readiness per category' })
  async getRubricReadiness(
    @Query('eventId', ParseIntPipe) eventId: number,
    @Query('courseId', new ParseIntPipe({ optional: true })) courseId?: number,
  ) {
    return this.criterionsService.getRubricReadiness(eventId, courseId);
  }

  @Get('course/:courseId')
  @ApiOperation({
    summary: 'Get criterions by course',
    description:
      'Retrieves all criterions associated with a specific course.',
  })
  @ApiParam({
    name: 'courseId',
    description: 'Course ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Criterions retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires read:events permission',
  })
  async findCriterionsByCourse(
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.criterionsService.findCriterionsByCourse(courseId);
  }

  @Get(':id')
  @RequirePermission('manage:events')
  @ApiOperation({
    summary: 'Get criterion by ID',
    description:
      'Retrieves details of a specific criterion including associated courses.',
  })
  @ApiParam({
    name: 'id',
    description: 'Criterion ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Criterion retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Criterion not found',
  })
  async getCriterion(@Param('id', ParseIntPipe) id: number) {
    return this.criterionsService.getCriterion(id);
  }

  @Put(':id')
  @RequirePermission('manage:events')
  @InvalidateCache({
    endpoints: ['/criterions', '/api/criterions'],
  })
  @ApiOperation({
    summary: 'Update an existing criterion',
    description:
      'Updates criterion details and associated courses. Requires EventManager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Criterion ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Criterion updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Criterion not found',
  })
  async updateCriterion(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCriterionDto: UpdateCriterionDto,
  ) {
    return this.criterionsService.updateCriterion(id, updateCriterionDto);
  }

  @Delete(':id')
  @RequirePermission('manage:events')
  @InvalidateCache({
    endpoints: ['/criterions', '/api/criterions'],
  })
  @ApiOperation({
    summary: 'Delete a criterion',
    description:
      'Soft deletes a criterion by marking it as inactive. Requires EventManager role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Criterion ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Criterion deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires manage:events permission',
  })
  @ApiResponse({
    status: 404,
    description: 'Criterion not found',
  })
  async deleteCriterion(@Param('id', ParseIntPipe) id: number) {
    return this.criterionsService.deleteCriterion(id);
  }
}