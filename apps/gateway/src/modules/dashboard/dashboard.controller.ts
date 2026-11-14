import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiSecurity('JWT-auth')
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('stats')
    @ApiBearerAuth()
    @RequirePermission('read:events')
    @ApiOperation({ summary: 'Get dashboard stats' })
    @ApiResponse({ status: 200, description: 'Returns dashboard stats' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Authentication required' })
    @ApiResponse({ status: 403, description: 'Forbidden - Missing read:events permission' })
    async getStats() {
        // Access is decided by read:events (Admin, FacultyAdmin, EventManager, Dean), not by role name
        return this.dashboardService.getStats();
    }
}
