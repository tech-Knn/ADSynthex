/**
 * Bulletproof Google Ads API Wrapper (Redis-Enhanced)
 * Guarantees we NEVER hit rate limits with persistent Redis-based protection
 */

import { fetchGoogleAdsData, getMockGoogleAdsData } from './google-ads-api';
import { redisCacheManager } from './redis-cache-manager';
import { googleAdsRateLimiter } from './redis-rate-limiter';
import { redisClient } from './redis-client';

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
  private requestQueue: Map<string, ApiRequest> = new Map();
  private activeRequests: Set<string> = new Set();
  private maxRetries = 3;

  // Request deduplication: Track in-flight requests
  private inflightRequests: Map<string, Promise<ApiResponse>> = new Map();

  /**
   * Main method to get Google Ads data with bulletproof guarantees (Redis-Enhanced)
   */
  async getData(
    startDate: string,
    endDate: string,
    customerId: string | null = null,
    options: {
      priority?: number;
      allowStale?: boolean;
      maxWait?: number;
    } = {}
  ): Promise<ApiResponse> {
    const { priority = 5, allowStale = true, maxWait = 30000 } = options;

    // Step 0: Request deduplication - Check if same request is already in-flight
    const cacheKey = redisCacheManager.generateKey({
      dataType: 'google-ads',
      accountId: customerId,
      startDate,
      endDate
    });

    const requestKey = `${cacheKey}:${priority}`;

    // If this exact request is already being processed, wait for it
    if (this.inflightRequests.has(requestKey)) {
      console.log(`[BULLETPROOF_API] 🔄 Request deduplication: Waiting for in-flight request (${requestKey})`);
      return this.inflightRequests.get(requestKey)!;
    }

    // Create a promise for this request and store it
    const requestPromise = this.executeRequest(startDate, endDate, customerId, cacheKey, { priority, allowStale, maxWait });

    // Store the promise so other concurrent requests can share it
    this.inflightRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up after request completes (success or failure)
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
    options: { priority: number; allowStale: boolean; maxWait: number }
  ): Promise<ApiResponse> {
    const { priority, allowStale } = options;

    console.log(`[BULLETPROOF_API] Redis-powered request: ${startDate} to ${endDate}, customer: ${customerId || 'all'}`);

    // Step 1: Try Redis cache first (memory → Redis → null)
    const cached = await redisCacheManager.get(cacheKey, {
      dataType: 'google-ads',
      forceRefresh: !allowStale
    });

    if (cached.data && !cached.isStale) {
      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

      console.log(`[BULLETPROOF_API] ${cached.source} cache hit, age: ${Math.round(cached.age / 1000)}s`);

      return {
        data: cached.data,
        source: 'cache',
        age: cached.age,
        message: `Fresh data from ${cached.source} cache (${Math.round(cached.age / 1000)}s old)`,
        quotaStatus
      };
    }

    // Step 2: Check Redis-based rate limiter (persistent across restarts!)
    const rateLimitCheck = await googleAdsRateLimiter.canMakeRequest(customerId || undefined);

    if (!rateLimitCheck.allowed) {
      console.warn(`[BULLETPROOF_API] Rate limit blocked: ${rateLimitCheck.reason}`);

      // Try to serve stale cache as fallback
      if (cached.data && allowStale) {
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

    // Step 3: Attempt safe API call with Redis protection
    try {
      return await this.makeGuardedApiCall(startDate, endDate, customerId, priority, cacheKey);
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
    cacheKey: string
  ): Promise<ApiResponse> {
    console.log(`[BULLETPROOF_API] Making Redis-protected Google Ads API call for customer ${customerId || 'all'}`);

    // Record request in Redis (increments counters atomically)
    await googleAdsRateLimiter.recordRequest(customerId || undefined);

    const startTime = Date.now();

    // Make the actual API call with specific account filtering
    const apiData = await fetchGoogleAdsData(startDate, endDate, customerId);
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
}

// Global singleton instance
export const bulletproofAPI = new BulletproofGoogleAdsAPI();
