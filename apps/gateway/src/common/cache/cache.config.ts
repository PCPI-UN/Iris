/**
 * Cache Configuration
 * 
 * This file contains TTL (Time To Live) configurations for different types of cached data.
 */

export const CacheConfig = {
  /**
   * Default TTL for cached responses (in seconds)
   */
  DEFAULT_TTL: 300, // 5 minutes

  /**
   * TTL configurations for specific endpoint patterns
   */
  ENDPOINT_TTL: {
    // User permissions - longer cache since platform permissions change infrequently
    'user-permissions': 900, // 15 minutes

    // List endpoints - moderate cache
    'list': 300, // 5 minutes

    // Criterions - relatively static during event lifecycle
    'criterions': 600, // 10 minutes

    // Event statuses - very long cache since enum values rarely change
    'events/statuses': 10800, // 3 hours

    // Events - static during active events
    'events': 600, // 10 minutes

    // Projects - changes frequently
    'projects': 180, // 3 minutes

    // Evaluations - changes frequently
    'evaluations': 120, // 2 minutes

    // Invitations - moderate change rate
    'invitations': 300, // 5 minutes

    // Event members and roles - relatively static
    'event-members': 600, // 10 minutes
    'event-roles': 600, // 10 minutes

    // Courses/Groups - static during event lifecycle
    'courses': 600, // 10 minutes
  },

  /**
   * Cache key prefixes for different data types
   */
  KEY_PREFIX: {
    HTTP_RESPONSE: 'http:response:',
    USER_PERMISSIONS: 'user:permissions:',
  },

  /**
   * Maximum cache size (optional, for memory management)
   */
  MAX_CACHE_SIZE: 10000, // Maximum number of keys

  /**
   * Enable/disable caching globally
   */
  ENABLED: true,
} as const;

/**
 * Helper function to get TTL for a specific endpoint
 */
export function getTTLForEndpoint(path: string): number {
  // Normalize path by removing leading/trailing slashes and 'api' prefix if present
  const normalizedPath = path
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .replace(/^api\//, '');

  // Check for exact matches first (more specific patterns)
  for (const [key, ttl] of Object.entries(CacheConfig.ENDPOINT_TTL)) {
    if (normalizedPath.startsWith(key)) {
      return ttl;
    }
  }

  // Extract the main resource from the path (e.g., criterions, events)
  const resource = normalizedPath.split('/')[0] || '';

  // Check if we have a TTL for this resource
  if (resource in CacheConfig.ENDPOINT_TTL) {
    return CacheConfig.ENDPOINT_TTL[resource as keyof typeof CacheConfig.ENDPOINT_TTL];
  }

  // Return default TTL if no specific configuration found
  return CacheConfig.DEFAULT_TTL;
}

/**
 * Determine if an endpoint should be cached
 */
export function shouldCacheEndpoint(path: string, method: string): boolean {
  // Only cache GET requests
  if (method !== 'GET') {
    return false;
  }

  // Don't cache health checks or metrics
  if (path.includes('/health') || path.includes('/metrics')) {
    return false;
  }

  // Don't cache auth-related endpoints (except user info)
  if (path.includes('/auth/') && !path.includes('/auth/me')) {
    return false;
  }

  return CacheConfig.ENABLED;
}
