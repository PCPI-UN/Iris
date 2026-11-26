import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// NOTE: Redis is currently disabled. Uncomment the initialization in constructor to re-enable.
import { createClient, RedisClientType } from 'redis';
import { createHash } from 'crypto';
import { AppUser } from '../../modules/auth/types/app-user.type';

export interface CacheKeyOptions {
  service?: string;
  endpoint: string;
  method?: string;
  userId?: number;
  platformPermissions?: string[];
  queryParams?: Record<string, any>;
  eventContext?: number;
  additionalContext?: Record<string, any>;
}

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: RedisClientType;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    // Redis initialization disabled - uncomment to enable
    // this.initializeRedisClient();
  }

  private async initializeRedisClient() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    try {
      this.redisClient = createClient({
        socket: {
          host,
          port,
        },
        password,
      }) as RedisClientType;

      this.redisClient.on('error', (err: any) => {
        this.logger.error(`Redis Client Error: ${err.message}`);
        this.isConnected = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis client connected');
        this.isConnected = true;
      });

      await this.redisClient.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Generate a cache key based on request context
   */
  generateCacheKey(options: CacheKeyOptions): string {
    const {
      service = 'gateway',
      endpoint,
      method = 'GET',
      userId,
      platformPermissions = [],
      queryParams = {},
      eventContext,
      additionalContext = {},
    } = options;

    // Normalize endpoint (remove leading/trailing slashes, lowercase)
    const normalizedEndpoint = endpoint.replace(/^\/+|\/+$/g, '').toLowerCase();

    // Now, we sort both permissions and query params to have a consistent
    // hashing
    const sortedParams = this.sortObject(queryParams);
    const sortedPermissions = [...platformPermissions].sort();

    const keyData = {
      service,
      endpoint: normalizedEndpoint,
      method,
      userId,
      permissions: sortedPermissions,
      query: sortedParams,
      event: eventContext,
      ...additionalContext,
    };

    // Generate hash from the key data
    const hash = this.hashObject(keyData);

    // Construct the cache key with a prefix and hash
    // Format: {service}:{method}:{endpoint-slug}:{userId}:{hash}
    const endpointSlug = normalizedEndpoint.replace(/\//g, ':');
    const key = `${service}:${method}:${endpointSlug}:${userId || 'anon'}:${hash}`;

    this.logger.debug(`Generated cache key: ${key}`);
    return key;
  }

  /**
   * Generate a cache key for user permissions
   */
  generateUserPermissionsCacheKey(userId: number): string {
    return `user:permissions:${userId}`;
  }

  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, skipping cache get');
      return null;
    }

    try {
      const cachedData = await this.redisClient.get(key);
      
      if (!cachedData) {
        this.logger.debug(`Cache miss: ${key}`);
        return null;
      }

      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cachedData) as T;
    } catch (error) {
      this.logger.error(`Error getting cache for key ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Redis not connected, skipping cache set');
      return;
    }

    try {
      await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      this.logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Error setting cache for key ${key}: ${error.message}`);
    }
  }

  /**
   * Delete a specific cache key
   */
  async delete(key: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.redisClient.del(key);
      this.logger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting cache for key ${key}: ${error.message}`);
    }
  }

  /**
   * Delete cache keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.redisClient.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      await this.redisClient.del(keys);
      this.logger.debug(`Cache pattern deleted: ${pattern} (${keys.length} keys)`);
      return keys.length;
    } catch (error) {
      this.logger.error(`Error deleting cache pattern ${pattern}: ${error.message}`);
      return 0;
    }
  }

  /**
   * Invalidate cache for a specific user
   */
  async invalidateUserCache(userId: number): Promise<void> {
    const pattern = `*:${userId}:*`;
    const deletedCount = await this.deletePattern(pattern);
    this.logger.log(`Invalidated ${deletedCount} cache entries for user ${userId}`);
  }

  /**
   * Invalidate cache for a specific endpoint
   */
  async invalidateEndpointCache(endpoint: string): Promise<void> {
    const normalizedEndpoint = endpoint.replace(/^\/+|\/+$/g, '').replace(/\//g, ':');
    const pattern = `*:${normalizedEndpoint}:*`;
    const deletedCount = await this.deletePattern(pattern);
    this.logger.log(`Invalidated ${deletedCount} cache entries for endpoint ${endpoint}`);
  }

  /**
   * Invalidate cache for an event context
   */
  async invalidateEventCache(eventId: number): Promise<void> {
    // For now, we are using a pattern match approach since we don't 
    // have the event context 
    const keys = await this.redisClient.keys('*');
    let deletedCount = 0;

    for (const key of keys) {
      const data = await this.get(key);
      if (data && typeof data === 'object' && 'eventId' in data && data.eventId === eventId) {
        await this.delete(key);
        deletedCount++;
      }
    }

    this.logger.log(`Invalidated ${deletedCount} cache entries for event ${eventId}`);
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.redisClient.flushDb();
      this.logger.warn('All cache cleared');
    } catch (error) {
      this.logger.error(`Error clearing all cache: ${error.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    if (!this.isConnected) {
      return { connected: false };
    }

    try {
      const info = await this.redisClient.info('stats');
      const dbSize = await this.redisClient.dbSize();
      
      return {
        connected: this.isConnected,
        dbSize,
        info,
      };
    } catch (error) {
      this.logger.error(`Error getting cache stats: ${error.message}`);
      return { connected: this.isConnected, error: error.message };
    }
  }

  /**
   * Hash an object to create a consistent cache key component
   */
  private hashObject(obj: any): string {
    const stringified = JSON.stringify(obj);
    return createHash('md5').update(stringified).digest('hex').substring(0, 16);
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    return Object.keys(obj)
      .sort()
      .reduce((result, key) => {
        result[key] = this.sortObject(obj[key]);
        return result;
      }, {} as any);
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.redisClient.quit();
      this.logger.log('Redis client disconnected');
    }
  }
}
