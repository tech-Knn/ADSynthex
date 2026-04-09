/**
 * Bulletproof Google Ads API Wrapper (Redis-Enhanced)
 * Guarantees we NEVER hit rate limits with persistent Redis-based protection
 */

import { fetchGoogleAdsData, getMockGoogleAdsData } from './google-ads-api';
import { redisCacheManager } from './redis-cache-manager';
import { googleAdsRateLimiter } from './redis-rate-limiter';
import { redisClient } from './redis-client';
import { FeedType } from './account-access-control';

interface ApiRequest {
  startDate: string;
  endDate: string;
  customerId?: string | null;
  priority: number;
  retryCount?: number;
}

interface ApiResponse {
  data: any;
  source: 'cache' | 'api' | 'stale' | 'fallback';
  age?: number;
  message: string;
  quotaStatus: any;
}

export class BulletproofGoogleAdsAPI {
  private maxRetries = 3;

  // Request deduplication: Track in-flight requests with cleanup
  private inflightRequests: Map<string, { promise: Promise<ApiResponse>; timestamp: number }> = new Map();
  private lastCleanup: number = 0;

  /**
   * Main method to get Google Ads data with bulletproof guarantees (Redis-Enhanced)
   * @param feedType - Filter accounts by feed type ('adscom', 'compado', 'inuvo') to prevent data mixing
   */
  async getData(
    startDate: string,
    endDate: string,
    customerId: string | null = null,
    options: {
      priority?: number;
      allowStale?: boolean;
      maxWait?: number;
      feedType?: FeedType | null;
    } = {}
  ): Promise<ApiResponse> {
    const { priority = 5, allowStale = true, maxWait = 30000, feedType = null } = options;

    // Step 0: Request deduplication - Check if same request is already in-flight
    // Include feedType in cache key to prevent cross-feed cache pollution
    const cacheKey = redisCacheManager.generateKey({
      dataType: 'google-ads',
      accountId: customerId,
      startDate,
      endDate,
      extra: feedType || undefined  // Use 'extra' parameter to include feedType in cache key
    });

    const requestKey = `${cacheKey}:${priority}`;

    // If this exact request is already being processed, wait for it
    const existing = this.inflightRequests.get(requestKey);
    if (existing) {
      console.log(`[BULLETPROOF_API] Request deduplication: Waiting for in-flight request (${requestKey})`);
      return existing.promise;
    }

    // Create a promise for this request and store it with timestamp
    const requestPromise = this.executeRequest(startDate, endDate, customerId, cacheKey, { priority, allowStale, maxWait, feedType });

    // Store the promise with timestamp for cleanup
    this.inflightRequests.set(requestKey, {
      promise: requestPromise,
      timestamp: Date.now()
    });

    // MEMORY PROTECTION: Cleanup on-demand (no setInterval in serverless)
    this.cleanupStaleRequestsIfNeeded();

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // CRITICAL: Clean up after request completes (success or failure)
      this.inflightRequests.delete(requestKey);
    }
  }

  /**
   * Internal method that actually executes the request
   */
  private async executeRequest(
    startDate: string,
    endDate: string,
    customerId: string | null,
    cacheKey: string,
    options: { priority: number; allowStale: boolean; maxWait: number; feedType?: FeedType | null }
  ): Promise<ApiResponse> {
    const { priority, allowStale, feedType } = options;

    console.log(`[BULLETPROOF_API] Redis-powered request: ${startDate} to ${endDate}, customer: ${customerId || 'all'}${feedType ? `, feed: ${feedType}` : ''}`);

    // Step 1: Try Redis cache first (memory → Redis → null)
    // CRITICAL: If allowStale=false (forceLive mode), skip cache entirely to get fresh geo_targets
    const cached = !allowStale ? { data: null, isStale: true, source: 'none', age: 0 } : await redisCacheManager.get(cacheKey, {
      dataType: 'google-ads',
      forceRefresh: false // Always false here since we handle forceRefresh above
    });

    if (cached.data && !cached.isStale && allowStale) {
      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

      // CRITICAL FIX: Invalidate cache if it has campaigns but NO ads
      // Both adsense and carhp feeds rely on ads to extract style_ids for revenue matching.
      // If ads are missing (e.g. ads query failed and was cached), $0 revenue results.
      if ((feedType === 'adsense' || feedType === 'carhp') && cached.data.campaigns?.length > 0 && (!cached.data.ads || cached.data.ads.length === 0)) {
        console.warn(`[BULLETPROOF_API] Cache has ${cached.data.campaigns.length} campaigns but 0 ads - INVALIDATING for ${feedType} feed`);
        // Don't return cached data - fetch fresh data instead
      } else {
        console.log(`[BULLETPROOF_API] ${cached.source} cache hit, age: ${Math.round(cached.age / 1000)}s`);

        return {
          data: cached.data,
          source: 'cache',
          age: cached.age,
          message: `Fresh data from ${cached.source} cache (${Math.round(cached.age / 1000)}s old)`,
          quotaStatus
        };
      }
    } else if (!allowStale) {
      console.log(`[BULLETPROOF_API] Force refresh mode - bypassing cache entirely`);
    }

    // Step 2: Check Redis-based rate limiter (persistent across restarts!)
    const rateLimitCheck = await googleAdsRateLimiter.canMakeRequest(customerId || undefined);

    if (!rateLimitCheck.allowed) {
      console.warn(`[BULLETPROOF_API] Rate limit blocked: ${rateLimitCheck.reason}`);

      // CRITICAL FIX: In Force Refresh mode (allowStale=false), do NOT serve stale cache
      // Instead, wait for rate limiter and retry
      if (!allowStale) {
        console.warn(`[BULLETPROOF_API] Force Refresh mode - waiting ${rateLimitCheck.waitTime || 1000}ms for rate limiter to reset`);
        await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTime || 1000));

        // Retry once after waiting
        const retryCheck = await googleAdsRateLimiter.canMakeRequest(customerId || undefined);
        if (!retryCheck.allowed) {
          throw new Error(`Rate limit still active after waiting. Please try again in ${Math.ceil((retryCheck.waitTime || 1000) / 1000)}s`);
        }
        // If allowed after waiting, continue to Step 3 below
      } else if (cached.data && allowStale) {
        // Only serve stale cache if allowStale=true (normal mode)
        const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

        console.log(`[BULLETPROOF_API] Serving stale cache due to rate limit, age: ${Math.round(cached.age / 1000)}s`);

        return {
          data: cached.data,
          source: 'stale',
          age: cached.age,
          message: `Stale data from cache (API in cooldown: ${rateLimitCheck.reason})`,
          quotaStatus
        };
      }

      // Last resort: return error
      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();
      return {
        data: null,
        source: 'fallback',
        message: `API unavailable: ${rateLimitCheck.reason}. ${rateLimitCheck.waitTime ? `Retry in ${Math.round(rateLimitCheck.waitTime / 1000)}s` : 'Retry later'}`,
        quotaStatus
      };
    }

    // Step 3: Attempt safe API call with Redis protection (with feed filtering)
    try {
      return await this.makeGuardedApiCall(startDate, endDate, customerId, priority, cacheKey, feedType);
    } catch (error) {
      console.error('[BULLETPROOF_API] API call failed:', error);

      // Handle rate limit errors with Redis persistence
      if (this.isRateLimitError(error)) {
        await googleAdsRateLimiter.handleRateLimitError(error);
      }

      // Fallback to stale cache
      if (cached.data && allowStale) {
        const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

        console.log(`[BULLETPROOF_API] API error, serving stale cache, age: ${Math.round(cached.age / 1000)}s`);

        return {
          data: cached.data,
          source: 'stale',
          age: cached.age,
          message: `Stale data (API error: ${error instanceof Error ? error.message : 'Unknown'})`,
          quotaStatus
        };
      }

      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();
      return {
        data: null,
        source: 'fallback',
        message: `API failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        quotaStatus
      };
    }
  }


  /**
   * Determine service type based on request characteristics (following Google's documentation)
   */
  private determineServiceType(
    startDate: string,
    endDate: string,
    customerId: string | null
  ): 'standard' | 'keyword_planning' | 'audience_insights' {
    // For now, all our requests are standard campaign/ad data requests
    // In the future, you could add logic to detect keyword planning or audience insights requests
    return 'standard';
  }

  /**
   * Make a guarded API call with Redis-based quota management
   */
  private async makeGuardedApiCall(
    startDate: string,
    endDate: string,
    customerId: string | null,
    priority: number,
    cacheKey: string,
    feedType?: FeedType | null
  ): Promise<ApiResponse> {
    console.log(`[BULLETPROOF_API] Making Redis-protected Google Ads API call for customer ${customerId || 'all'}${feedType ? `, feed: ${feedType}` : ''}`);

    // NOTE: Request recording now happens inside fetchGoogleAdsData() per-query for accurate tracking
    // We no longer record here to avoid double-counting

    const startTime = Date.now();

    // Make the actual API call with feed type filtering to prevent data mixing
    const apiData = await fetchGoogleAdsData(startDate, endDate, customerId, feedType);
    const responseTime = Date.now() - startTime;

    if (!apiData || !apiData.ads) {
      throw new Error('Invalid API response structure');
    }

    // Store in Redis cache (memory + Redis layers)
    await redisCacheManager.set(cacheKey, apiData, {
      dataType: 'google-ads',
      priority: 'high'
    });

    // Record successful API call
    redisCacheManager.recordApiCall();

    console.log(`[BULLETPROOF_API] API call successful in ${responseTime}ms, ${apiData.ads.length} ads (cached in Redis)`);

    const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

    return {
      data: apiData,
      source: 'api',
      message: `Fresh data from Google Ads API (${responseTime}ms, Redis-protected)`,
      quotaStatus
    };
  }

  /**
   * Check if error is rate limit related
   */
  private isRateLimitError(error: any): boolean {
    const errorStr = JSON.stringify(error).toLowerCase();
    return errorStr.includes('too many requests') ||
      errorStr.includes('rate limit') ||
      errorStr.includes('429') ||
      errorStr.includes('resource_exhausted') ||
      errorStr.includes('retry in');
  }

  /**
   * Get system health status (Redis-enhanced)
   */
  async getHealthStatus() {
    const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();
    const cacheStats = redisCacheManager.getStats();

    return {
      quota: quotaStatus,
      cache: cacheStats,
      redis: redisClient.getHealthStatus(),
      canMakeRequests: quotaStatus.safeToOperate,
      systemHealth: quotaStatus.safeToOperate ? 'healthy' : 'degraded',
      recommendations: this.getRecommendations(quotaStatus, cacheStats)
    };
  }

  /**
   * Get system recommendations
   */
  private getRecommendations(quotaStatus: any, cacheStats: any): string[] {
    const recommendations = [];

    if (quotaStatus.usagePercentage > 80) {
      recommendations.push('High quota usage - relying more on cache');
    }

    if (quotaStatus.isInCooldown) {
      recommendations.push(`In cooldown until ${quotaStatus.cooldownEnds} - serving cached data`);
    }

    if (cacheStats.hitRate < 0.7) {
      recommendations.push('Low cache hit rate - consider increasing cache TTL');
    }

    if (!quotaStatus.safeToOperate) {
      recommendations.push('API requests paused - serving cached/stale data only');
    } else {
      recommendations.push('System operating normally');
    }

    return recommendations;
  }

  /**
   * Manual cache warm-up (use during low-traffic periods) - Redis-enhanced
   */
  async warmUpCache(
    dateRanges: Array<{ startDate: string; endDate: string; customerId?: string | null }>
  ): Promise<void> {
    console.log(`[BULLETPROOF_API] Starting Redis-powered cache warm-up for ${dateRanges.length} date ranges`);

    for (const range of dateRanges) {
      const rateLimitCheck = await googleAdsRateLimiter.canMakeRequest();
      if (!rateLimitCheck.allowed) {
        console.log(`[BULLETPROOF_API] Stopping warm-up due to rate limits: ${rateLimitCheck.reason}`);
        break;
      }

      try {
        await this.getData(range.startDate, range.endDate, range.customerId, {
          priority: 1,
          allowStale: false
        });

        // Wait between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error('[BULLETPROOF_API] Warm-up request failed:', error);
      }
    }

    console.log('[BULLETPROOF_API] Cache warm-up completed');
  }

  /**
   * MEMORY PROTECTION: Cleanup stale in-flight requests (on-demand, no intervals)
   * Runs at most once every 2 minutes to avoid overhead
   */
  private cleanupStaleRequestsIfNeeded(): void {
    const now = Date.now();

    // Only cleanup every 2 minutes max
    if (now - this.lastCleanup < 120000) {
      return;
    }

    this.lastCleanup = now;
    this.cleanupStaleRequests();
  }

  /**
   * MEMORY PROTECTION: Cleanup stale in-flight requests
   * Removes requests stuck for >5 minutes (likely failed/timed out)
   */
  private cleanupStaleRequests(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    let cleaned = 0;

    for (const [key, entry] of this.inflightRequests.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.inflightRequests.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[BULLETPROOF_API] 🧹 Cleaned up ${cleaned} stale in-flight requests (memory protection)`);
    }

    // Log memory status if map is getting large
    if (this.inflightRequests.size > 10) {
      console.warn(`[BULLETPROOF_API] Large inflightRequests map: ${this.inflightRequests.size} entries`);
    }
  }

  /**
   * Get current memory status
   */
  getMemoryStatus() {
    return {
      inflightRequests: this.inflightRequests.size,
      memoryUsage: process.memoryUsage()
    };
  }
}

// Global singleton instance
export const bulletproofAPI = new BulletproofGoogleAdsAPI();
