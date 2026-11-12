import {
    Controller,
    Post,
    Get,
    Put,
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
} from '@nestjs/swagger';
import { TieBreaksService } from './tiebreaks.service';
import { CreateTieBreakDto } from './dto/create-tiebreak.dto';
import { UpdateTieBreakDto } from './dto/update-tiebreak.dto';
import { ListTieBreaksDto } from './dto/list-tiebreaks.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('tiebreaks')
@ApiSecurity('JWT-auth')
@Controller('tiebreaks')
export class TieBreaksController {
    constructor(private readonly tieBreaksService: TieBreaksService) {}

    @Post()
    @RequirePermission('manage:events')
    @ApiOperation({
        summary: 'Create a tiebreak',
        description: 'Assigns a tiebreak order to a project within a specific event and award category. Requires manage:events permission.',
    })
    @ApiResponse({ status: 201, description: 'TieBreak created successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 403, description: 'Forbidden - Requires manage:events permission' })
    @ApiResponse({ status: 409, description: 'A tiebreak for this project/event/category already exists' })
    async createTieBreak(@Body() dto: CreateTieBreakDto) {
        return this.tieBreaksService.createTieBreak(dto);
    }

    @Get()
    @RequirePermission('read:grades')
    @ApiOperation({
        summary: 'List tiebreaks',
        description: 'Retrieves tiebreaks, optionally filtered by eventId, categoryId, or projectId. Results are ordered by tiebreakOrder ascending.',
    })
    @ApiResponse({ status: 200, description: 'TieBreaks retrieved successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - Requires read:grades permission' })
    async listTieBreaks(@Query() query: ListTieBreaksDto) {
        return this.tieBreaksService.listTieBreaks(query);
    }

    @Get(':id')
    @RequirePermission('read:grades')
    @ApiOperation({
        summary: 'Get tiebreak by ID',
        description: 'Retrieves a single tiebreak record by its ID.',
    })
    @ApiParam({ name: 'id', description: 'TieBreak ID', example: 1 })
    @ApiResponse({ status: 200, description: 'TieBreak retrieved successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - Requires read:grades permission' })
    @ApiResponse({ status: 404, description: 'TieBreak not found' })
    async getTieBreak(@Param('id', ParseIntPipe) id: number) {
        return this.tieBreaksService.getTieBreak(id);
    }

    @Put(':id')
    @RequirePermission('manage:events')
    @ApiOperation({
        summary: 'Update a tiebreak',
        description: 'Updates the order, project, or category of an existing tiebreak. Requires manage:events permission.',
    })
    @ApiParam({ name: 'id', description: 'TieBreak ID', example: 1 })
    @ApiResponse({ status: 200, description: 'TieBreak updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 403, description: 'Forbidden - Requires manage:events permission' })
    @ApiResponse({ status: 404, description: 'TieBreak not found' })
    async updateTieBreak(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateTieBreakDto,
    ) {
        return this.tieBreaksService.updateTieBreak(id, dto);
    }

    @Delete(':id')
    @RequirePermission('manage:events')
    @ApiOperation({
        summary: 'Delete a tiebreak',
        description: 'Permanently removes a tiebreak record. Requires manage:events permission.',
    })
    @ApiParam({ name: 'id', description: 'TieBreak ID', example: 1 })
    @ApiResponse({ status: 200, description: 'TieBreak deleted successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - Requires manage:events permission' })
    @ApiResponse({ status: 404, description: 'TieBreak not found' })
    async deleteTieBreak(@Param('id', ParseIntPipe) id: number) {
        return this.tieBreaksService.deleteTieBreak(id);
    }
}
