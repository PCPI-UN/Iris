/**
 * Cache Management Controller
 * 
 * This controller provides endpoints for monitoring and managing the cache.
 * Should only be accessible to administrators.
 */

import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiSecurity } from '@nestjs/swagger';
import { RequirePermission } from '../decorators/require-permission.decorator';
import { CacheService } from '../cache/cache.service';

@ApiTags('Cache Management')
@ApiSecurity('JWT-auth')
@Controller('admin/cache')
@RequirePermission('admin:system')
export class CacheManagementController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Get cache statistics',
    description: 'Returns statistics about the Redis cache usage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cache statistics retrieved successfully',
  })
  async getCacheStats() {
    const stats = await this.cacheService.getStats();
    return {
      message: 'Cache statistics retrieved',
      data: stats,
    };
  }

  @Delete('clear-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear all cache',
    description:
      'WARNING: Clears the entire cache. Use with caution in production.',
  })
  @ApiResponse({
    status: 200,
    description: 'All cache cleared successfully',
  })
  async clearAllCache() {
    await this.cacheService.clearAll();
    return {
      message: 'All cache cleared successfully',
      warning: 'This operation cleared the entire cache',
    };
  }

  @Delete('user/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear cache for a specific user',
    description: 'Invalidates all cached data for the specified user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User cache cleared successfully',
  })
  async clearUserCache(@Param('userId', ParseIntPipe) userId: number) {
    await this.cacheService.invalidateUserCache(userId);
    return {
      message: `Se limpió la caché del usuario ${userId}`,
    };
  }

  @Delete('endpoint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear cache for a specific endpoint',
    description: 'Invalidates all cached data for the specified endpoint path.',
  })
  @ApiResponse({
    status: 200,
    description: 'Endpoint cache cleared successfully',
  })
  async clearEndpointCache(@Query('path') path: string) {
    if (!path) {
      return {
        error: 'Falta el parámetro obligatorio de la consulta: path',
      };
    }

    await this.cacheService.invalidateEndpointCache(path);
    return {
      message: `Cache cleared for endpoint: ${path}`,
    };
  }

  @Delete('event/:eventId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear cache for a specific event',
    description: 'Invalidates all cached data related to the specified event.',
  })
  @ApiResponse({
    status: 200,
    description: 'Event cache cleared successfully',
  })
  async clearEventCache(@Param('eventId', ParseIntPipe) eventId: number) {
    await this.cacheService.invalidateEventCache(eventId);
    return {
      message: `Se limpió la caché del evento ${eventId}`,
    };
  }

  @Delete('pattern')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear cache by pattern',
    description:
      'Invalidates all cache keys matching the specified pattern. Use with caution.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pattern cache cleared successfully',
  })
  async clearCachePattern(@Query('pattern') pattern: string) {
    if (!pattern) {
      return {
        error: 'Falta el parámetro obligatorio de la consulta: pattern',
      };
    }

    const deletedCount = await this.cacheService.deletePattern(pattern);
    return {
      message: `Cache pattern cleared: ${pattern}`,
      deletedKeys: deletedCount,
    };
  }
}
