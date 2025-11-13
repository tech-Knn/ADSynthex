/**
 * Redis Cache Manager
 * 3-tier caching: Memory (hot) → Redis (warm) → API (cold)
 * Persistent caching with intelligent TTL management
 */

import { redisClient } from './redis-client';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  source: 'memory' | 'redis' | 'api';
  dataType?: 'google-ads' | 'adscom' | 'compado' | 'unified';
}

interface CacheStats {
  memoryHits: number;
  redisHits: number;
  apiCalls: number;
  totalRequests: number;
  hitRate: number;
  memoryCacheSize: number;
  redisConnected: boolean;
}

interface CacheOptions {
  ttl?: number;
  dataType?: 'google-ads' | 'adscom' | 'compado' | 'unified';
  priority?: 'high' | 'medium' | 'low';
  forceRefresh?: boolean;
}

export class RedisCacheManager {
  private memoryCache: Map<string, CacheEntry> = new Map();
  private stats = {
    memoryHits: 0,
    redisHits: 0,
    apiCalls: 0,
    totalRequests: 0
  };

  // TTL configuration optimized for RATE LIMIT PROTECTION + reasonable freshness (in seconds)
  // CRITICAL: Longer TTLs = fewer API calls = better rate limit protection
  private ttlConfig = {
    'google-ads': {
      current: 900,      // 15 min for today (balanced freshness + protection)
      recent: 3600,      // 1 hour for last 7 days
      historical: 7200   // 2 hours for older data
    },
    'adscom': {
      current: 900,      // 15 min
      recent: 3600,      // 1 hour
      historical: 7200   // 2 hours
    },
    'compado': {
      current: 900,      // 15 min for fresh conversion data (increased for rate limit protection)
      recent: 3600,      // 1 hour
      historical: 7200   // 2 hours
    },
    'unified': {
      current: 600,      // 10 min for cost+revenue combined view (most accessed)
      recent: 1800,      // 30 minutes
      historical: 3600   // 1 hour
    }
  };

  private maxMemoryCacheSize = 20; // Max entries in memory cache (reduced for production memory limits)

  /**
   * Get data from cache (memory → Redis → returns null)
   */
  async get(key: string, options: CacheOptions = {}): Promise<{
    data: any | null;
    source: 'memory' | 'redis' | null;
    age: number;
    isStale: boolean;
  }> {
    this.stats.totalRequests++;

    const { forceRefresh = false } = options;

    if (forceRefresh) {
      return { data: null, source: null, age: 0, isStale: false };
    }

    // TIER 1: Check memory cache (fastest)
    const memoryResult = this.getFromMemory(key);
    if (memoryResult.data) {
      this.stats.memoryHits++;
      console.log(`[REDIS_CACHE] Memory hit: ${key}, age: ${Math.round(memoryResult.age / 1000)}s`);
      return {
        ...memoryResult,
        source: 'memory'
      };
    }

    // TIER 2: Check Redis cache
    try {
      const redisData = await redisClient.get(`cache:${key}`);

      if (redisData) {
        const entry: CacheEntry = JSON.parse(redisData);
        const age = Date.now() - entry.timestamp;
        const isStale = age > (entry.ttl * 1000);

        if (!isStale) {
          this.stats.redisHits++;

          // Populate memory cache for next time
          this.setInMemory(key, entry.data, entry.ttl, entry.dataType);

          console.log(`[REDIS_CACHE] Redis hit: ${key}, age: ${Math.round(age / 1000)}s`);

          return {
            data: entry.data,
            source: 'redis',
            age,
            isStale: false
          };
        } else {
          console.log(`[REDIS_CACHE] Redis stale: ${key}, age: ${Math.round(age / 1000)}s, ttl: ${entry.ttl}s`);
        }
      }
    } catch (error) {
      console.error(`[REDIS_CACHE] Error getting from Redis:`, error);
    }

    // Cache miss
    return { data: null, source: null, age: 0, isStale: false };
  }

  /**
   * Store data in cache (memory + Redis)
   */
  async set(key: string, data: any, options: CacheOptions = {}): Promise<void> {
    try {
      const {
        ttl: customTTL,
        dataType = 'google-ads',
        priority = 'medium'
      } = options;

      // Determine TTL based on data age and type
      const ttl = customTTL || this.determineTTL(key, dataType);

      // Store in memory cache
      this.setInMemory(key, data, ttl, dataType);

      // Store in Redis with TTL
      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        ttl,
        source: 'api',
        dataType
      };

      await redisClient.setex(`cache:${key}`, ttl, JSON.stringify(entry));

      console.log(`[REDIS_CACHE] Stored ${key} with TTL ${ttl}s, type: ${dataType}`);

    } catch (error) {
      console.error(`[REDIS_CACHE] Error setting cache:`, error);
    }
  }

  /**
   * Check if cache should be refreshed
   */
  async shouldRefresh(key: string, dataType: 'google-ads' | 'adscom' | 'compado' | 'unified' = 'google-ads'): Promise<{
    shouldRefresh: boolean;
    reason: string;
    backgroundRefresh: boolean;
  }> {
    const result = await this.get(key, { dataType });

    if (!result.data) {
      return {
        shouldRefresh: true,
        reason: 'cache_miss',
        backgroundRefresh: false
      };
    }

    const ttl = this.determineTTL(key, dataType);
    const refreshThreshold = ttl * 0.7; // Refresh when 70% of TTL has passed

    if (result.age > refreshThreshold * 1000) {
      return {
        shouldRefresh: true,
        reason: 'cache_aging',
        backgroundRefresh: true // Can serve stale while refreshing
      };
    }

    return {
      shouldRefresh: false,
      reason: 'cache_fresh',
      backgroundRefresh: false
    };
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidate(pattern?: string): Promise<number> {
    let count = 0;

    // Invalidate memory cache
    if (pattern) {
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);
          count++;
        }
      }
    } else {
      count = this.memoryCache.size;
      this.memoryCache.clear();
    }

    console.log(`[REDIS_CACHE] Invalidated ${count} entries from memory cache`);

    // Note: Redis invalidation would require SCAN command
    // For now, rely on TTL expiry

    return count;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const hitRate = this.stats.totalRequests > 0
      ? ((this.stats.memoryHits + this.stats.redisHits) / this.stats.totalRequests) * 100
      : 0;

    return {
      memoryHits: this.stats.memoryHits,
      redisHits: this.stats.redisHits,
      apiCalls: this.stats.apiCalls,
      totalRequests: this.stats.totalRequests,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryCacheSize: this.memoryCache.size,
      redisConnected: redisClient.isRedisConnected()
    };
  }

  /**
   * Record API call
   */
  recordApiCall(): void {
    this.stats.apiCalls++;
  }

  /**
   * Generate cache key
   */
  generateKey(params: {
    dataType: 'google-ads' | 'adscom' | 'compado' | 'unified';
    accountId?: string | null;
    startDate: string;
    endDate: string;
    extra?: string;
  }): string {
    const { dataType, accountId, startDate, endDate, extra } = params;
    const account = accountId || 'all';
    const parts = [dataType, account, startDate, endDate];

    if (extra) {
      parts.push(extra);
    }

    return parts.join(':');
  }

  // ============ PRIVATE METHODS ============

  private getFromMemory(key: string): {
    data: any | null;
    age: number;
    isStale: boolean;
  } {
    const entry = this.memoryCache.get(key);

    if (!entry) {
      return { data: null, age: 0, isStale: false };
    }

    const age = Date.now() - entry.timestamp;
    const isStale = age > (entry.ttl * 1000);

    // Remove stale entries from memory
    if (isStale) {
      this.memoryCache.delete(key);
      return { data: null, age, isStale: true };
    }

    return {
      data: entry.data,
      age,
      isStale: false
    };
  }

  private setInMemory(key: string, data: any, ttl: number, dataType?: 'google-ads' | 'adscom' | 'compado' | 'unified'): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl,
      source: 'memory',
      dataType
    };

    this.memoryCache.set(key, entry);

    // Cleanup if cache is too large
    if (this.memoryCache.size > this.maxMemoryCacheSize) {
      this.cleanupMemoryCache();
    }
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    let deletedCount = 0;

    // First, remove stale entries
    for (const [key, entry] of this.memoryCache.entries()) {
      const age = now - entry.timestamp;
      if (age > (entry.ttl * 1000)) {
        this.memoryCache.delete(key);
        deletedCount++;
      }
    }

    // AGGRESSIVE: If still too large, remove oldest 50% (was 20%)
    if (this.memoryCache.size > this.maxMemoryCacheSize) {
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = Math.floor(entries.length * 0.5); // Increased from 0.2 to 0.5
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(entries[i][0]);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[REDIS_CACHE] Cleaned up ${deletedCount} entries from memory cache`);
    }
  }

  private determineTTL(key: string, dataType?: 'google-ads' | 'adscom' | 'compado' | 'unified'): number {
    const config = this.ttlConfig[dataType as keyof typeof this.ttlConfig] || this.ttlConfig['google-ads'];

    // Extract dates from key to determine if data is current, recent, or historical
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (key.includes(today)) {
      return config.current;
    } else if (key.includes(yesterday)) {
      return config.recent;
    } else {
      return config.historical;
    }
  }

  /**
   * Get or set pattern (common caching pattern)
   */
  async getOrSet(
    key: string,
    fetchFunction: () => Promise<any>,
    options: CacheOptions = {}
  ): Promise<{
    data: any;
    source: 'memory' | 'redis' | 'api';
    age: number;
  }> {
    // Try to get from cache
    const cached = await this.get(key, options);

    if (cached.data) {
      return {
        data: cached.data,
        source: cached.source!,
        age: cached.age
      };
    }

    // Cache miss - fetch from API
    console.log(`[REDIS_CACHE] Cache miss for ${key}, fetching from API`);
    this.recordApiCall();

    const data = await fetchFunction();

    // Store in cache
    await this.set(key, data, options);

    return {
      data,
      source: 'api',
      age: 0
    };
  }

  /**
   * Warmup cache with common queries
   */
  async warmupCache(
    dataType: 'google-ads' | 'adscom' | 'compado' | 'unified',
    accounts: string[],
    dates: Array<{ startDate: string; endDate: string }>,
    fetchFunction: (accountId: string | null, startDate: string, endDate: string) => Promise<any>
  ): Promise<number> {
    console.log(`[REDIS_CACHE] Starting cache warmup for ${dataType}...`);
    let warmedCount = 0;

    for (const account of accounts) {
      for (const { startDate, endDate } of dates) {
        const key = this.generateKey({
          dataType,
          accountId: account,
          startDate,
          endDate
        });

        // Check if already cached
        const cached = await this.get(key);
        if (cached.data) {
          console.log(`[REDIS_CACHE] Warmup skip (already cached): ${key}`);
          continue;
        }

        try {
          // Fetch and cache
          const data = await fetchFunction(account, startDate, endDate);
          await this.set(key, data, { dataType: dataType as any });
          warmedCount++;

          console.log(`[REDIS_CACHE] Warmed up: ${key}`);

          // Wait between requests to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`[REDIS_CACHE] Warmup error for ${key}:`, error);
        }
      }
    }

    console.log(`[REDIS_CACHE] Cache warmup complete: ${warmedCount} entries cached`);
    return warmedCount;
  }
}

// Global singleton instance
export const redisCacheManager = new RedisCacheManager();
