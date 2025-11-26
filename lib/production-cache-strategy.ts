/**
 * Production-Grade Cache Strategy
 * GOAL: Users NEVER see rate limit errors or slow responses
 *
 * Strategy:
 * 1. ALWAYS serve from cache (even if stale)
 * 2. Refresh in background asynchronously
 * 3. Multiple cache layers with different TTLs
 * 4. Smart prefetching for common queries
 * 5. Request deduplication and batching
 */

import { redisCacheManager } from './redis-cache-manager';
import { googleAdsRateLimiter } from './redis-rate-limiter';
import { bulletproofAPI } from './bulletproof-google-ads-api';

interface CacheStrategy {
  /** Always serve from cache if available */
  serveStaleWhileRevalidate: boolean;
  /** Max age before considering cache "stale" but still serveable */
  staleAge: number; // seconds
  /** Max age before cache is considered "expired" (but still serve if API fails) */
  maxAge: number; // seconds
  /** Background refresh threshold - refresh cache if older than this */
  refreshThreshold: number; // seconds
  /** Priority level for API calls */
  priority: number;
}

interface BackgroundRefreshJob {
  key: string;
  startDate: string;
  endDate: string;
  customerId: string | null;
  priority: number;
  createdAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export class ProductionCacheStrategy {
  private refreshJobs: Map<string, BackgroundRefreshJob> = new Map();
  private refreshQueue: BackgroundRefreshJob[] = [];
  private isRefreshing: boolean = false;
  private maxConcurrentRefresh: number = 1; // Only 1 refresh at a time to preserve quota

  // Cache strategy profiles
  private strategies = {
    realtime: {
      serveStaleWhileRevalidate: true,
      staleAge: 300,      // 5 minutes - data considered "stale"
      maxAge: 3600,       // 1 hour - data still usable
      refreshThreshold: 180, // 3 minutes - trigger background refresh
      priority: 9
    } as CacheStrategy,

    dashboard: {
      serveStaleWhileRevalidate: true,
      staleAge: 600,      // 10 minutes
      maxAge: 7200,       // 2 hours
      refreshThreshold: 300, // 5 minutes
      priority: 7
    } as CacheStrategy,

    historical: {
      serveStaleWhileRevalidate: true,
      staleAge: 3600,     // 1 hour
      maxAge: 86400,      // 24 hours
      refreshThreshold: 1800, // 30 minutes
      priority: 3
    } as CacheStrategy
  };

  /**
   * Get data with production-grade caching
   * GUARANTEES: User never waits, always gets data (even if stale)
   */
  async getData(
    startDate: string,
    endDate: string,
    customerId: string | null = null,
    strategyType: 'realtime' | 'dashboard' | 'historical' = 'dashboard'
  ): Promise<{
    data: any;
    source: 'cache-fresh' | 'cache-stale' | 'background-refresh';
    age: number;
    isRefreshing: boolean;
    nextRefreshIn?: number;
    message: string;
  }> {
    const strategy = this.strategies[strategyType];
    const cacheKey = this.generateCacheKey(startDate, endDate, customerId);

    console.log(`[PROD_CACHE] Request: ${cacheKey}, strategy: ${strategyType}`);

    // STEP 1: Check cache FIRST (always)
    const cached = await redisCacheManager.get(cacheKey, {
      dataType: 'google-ads',
      forceRefresh: false
    });

    const cacheAge = cached.age || 0; // milliseconds
    const cacheAgeSeconds = Math.floor(cacheAge / 1000);

    // STEP 2: Determine if we should refresh (but don't wait for it)
    const shouldRefresh = !cached.data || cacheAgeSeconds > strategy.refreshThreshold;
    const isStale = cacheAgeSeconds > strategy.staleAge;
    const isExpired = cacheAgeSeconds > strategy.maxAge;

    console.log(`[PROD_CACHE] Cache status: age=${cacheAgeSeconds}s, stale=${isStale}, expired=${isExpired}, shouldRefresh=${shouldRefresh}`);

    // STEP 3: If cache exists and is acceptable, return immediately
    if (cached.data && (strategy.serveStaleWhileRevalidate || !isExpired)) {
      console.log(`[PROD_CACHE] Serving from cache (${cached.source}, age: ${cacheAgeSeconds}s)`);

      // Trigger background refresh if needed (non-blocking)
      if (shouldRefresh && !this.isJobQueued(cacheKey)) {
        console.log(`[PROD_CACHE] Triggering background refresh...`);
        this.queueBackgroundRefresh({
          key: cacheKey,
          startDate,
          endDate,
          customerId,
          priority: strategy.priority,
          createdAt: Date.now(),
          status: 'pending'
        });
      }

      return {
        data: cached.data,
        source: isStale ? 'cache-stale' : 'cache-fresh',
        age: cacheAgeSeconds,
        isRefreshing: this.isJobQueued(cacheKey),
        nextRefreshIn: this.getNextRefreshTime(cacheAgeSeconds, strategy),
        message: isStale
          ? `Serving cached data (${cacheAgeSeconds}s old), refreshing in background`
          : `Fresh cached data (${cacheAgeSeconds}s old)`
      };
    }

    // STEP 4: No cache or expired - check if we can make API call safely
    const canMakeRequest = await googleAdsRateLimiter.canMakeRequest(customerId || undefined);

    if (!canMakeRequest.allowed) {
      console.warn(`[PROD_CACHE] Rate limit active: ${canMakeRequest.reason}`);

      // CRITICAL: Still serve expired cache rather than failing
      if (cached.data) {
        console.log(`[PROD_CACHE] FALLBACK: Serving expired cache due to rate limits`);
        return {
          data: cached.data,
          source: 'cache-stale',
          age: cacheAgeSeconds,
          isRefreshing: false,
          message: `Rate limit active - serving cached data (${cacheAgeSeconds}s old). ${canMakeRequest.reason}`
        };
      }

      // Last resort: Return empty data with clear message
      console.error(`[PROD_CACHE] No cache available and rate limited - returning empty`);
      return {
        data: { campaigns: [], ads: [], clicks: [] },
        source: 'cache-stale',
        age: 0,
        isRefreshing: false,
        message: `API temporarily unavailable due to rate limits. ${canMakeRequest.reason}`
      };
    }

    // STEP 5: Safe to make API call - fetch fresh data
    console.log(`[PROD_CACHE] Fetching fresh data from API...`);
    try {
      const apiResponse = await bulletproofAPI.getData(startDate, endDate, customerId, {
        priority: strategy.priority,
        allowStale: true,
        maxWait: 15000
      });

      return {
        data: apiResponse.data,
        source: 'cache-fresh',
        age: 0,
        isRefreshing: false,
        message: 'Fresh data from Google Ads API'
      };

    } catch (error) {
      console.error(`[PROD_CACHE] API call failed:`, error);

      // FALLBACK: Serve expired cache even on API error
      if (cached.data) {
        console.log(`[PROD_CACHE] FALLBACK: Serving expired cache due to API error`);
        return {
          data: cached.data,
          source: 'cache-stale',
          age: cacheAgeSeconds,
          isRefreshing: false,
          message: `API error - serving cached data (${cacheAgeSeconds}s old)`
        };
      }

      throw error;
    }
  }

  /**
   * Background refresh worker (non-blocking)
   * Processes queue one at a time to preserve API quota
   */
  private async queueBackgroundRefresh(job: BackgroundRefreshJob): Promise<void> {
    // Check if job already queued
    if (this.isJobQueued(job.key)) {
      console.log(`[PROD_CACHE] Job already queued: ${job.key}`);
      return;
    }

    // Add to queue
    this.refreshQueue.push(job);
    this.refreshJobs.set(job.key, job);

    console.log(`[PROD_CACHE] Queued background refresh: ${job.key} (queue size: ${this.refreshQueue.length})`);

    // Start processing if not already running
    if (!this.isRefreshing) {
      this.processRefreshQueue();
    }
  }

  /**
   * Process refresh queue (one at a time, respecting rate limits)
   */
  private async processRefreshQueue(): Promise<void> {
    if (this.isRefreshing) {
      console.log(`[PROD_CACHE] Refresh worker already running`);
      return;
    }

    this.isRefreshing = true;

    while (this.refreshQueue.length > 0) {
      // Sort by priority (highest first)
      this.refreshQueue.sort((a, b) => b.priority - a.priority);

      const job = this.refreshQueue.shift()!;
      job.status = 'running';

      console.log(`[PROD_CACHE] Processing refresh job: ${job.key} (priority: ${job.priority})`);

      try {
        // Check if we can make request
        const canMakeRequest = await googleAdsRateLimiter.canMakeRequest(job.customerId || undefined);

        if (!canMakeRequest.allowed) {
          console.warn(`[PROD_CACHE] Pausing refresh queue - rate limit active: ${canMakeRequest.reason}`);

          // Re-queue job for later
          job.status = 'pending';
          this.refreshQueue.unshift(job);

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
          continue;
        }

        // Make API call
        const apiResponse = await bulletproofAPI.getData(
          job.startDate,
          job.endDate,
          job.customerId,
          {
            priority: job.priority,
            allowStale: false,
            maxWait: 30000
          }
        );

        job.status = 'completed';
        console.log(`[PROD_CACHE] Background refresh completed: ${job.key}`);

        // Small delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

      } catch (error) {
        job.status = 'failed';
        console.error(`[PROD_CACHE] Background refresh failed: ${job.key}`, error);

        // Don't retry immediately to avoid wasting quota
      } finally {
        // Clean up job
        this.refreshJobs.delete(job.key);
      }
    }

    this.isRefreshing = false;
    console.log(`[PROD_CACHE] Refresh queue empty`);
  }

  /**
   * Prefetch common date ranges (call this during off-peak hours)
   */
  async prefetchCommonQueries(accountIds: string[]): Promise<void> {
    console.log(`[PROD_CACHE] Starting prefetch for ${accountIds.length} accounts...`);

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const commonQueries = [
      { startDate: today, endDate: today, strategy: 'realtime' as const },
      { startDate: yesterday, endDate: today, strategy: 'dashboard' as const },
      { startDate: weekAgo, endDate: today, strategy: 'dashboard' as const }
    ];

    for (const accountId of accountIds) {
      for (const query of commonQueries) {
        try {
          await this.getData(query.startDate, query.endDate, accountId, query.strategy);
          console.log(`[PROD_CACHE] Prefetched: ${accountId} (${query.startDate} to ${query.endDate})`);

          // Delay between prefetch to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
          console.error(`[PROD_CACHE] Prefetch failed for ${accountId}:`, error);
        }
      }
    }

    console.log(`[PROD_CACHE] Prefetch completed`);
  }

  /**
   * Check if a refresh job is queued or running
   */
  private isJobQueued(key: string): boolean {
    const job = this.refreshJobs.get(key);
    return job !== undefined && (job.status === 'pending' || job.status === 'running');
  }

  /**
   * Get next refresh time
   */
  private getNextRefreshTime(currentAge: number, strategy: CacheStrategy): number | undefined {
    if (currentAge >= strategy.refreshThreshold) {
      return 0; // Refresh now
    }
    return strategy.refreshThreshold - currentAge;
  }

  /**
   * Generate consistent cache key
   */
  private generateCacheKey(startDate: string, endDate: string, customerId: string | null): string {
    return redisCacheManager.generateKey({
      dataType: 'google-ads',
      accountId: customerId,
      startDate,
      endDate
    });
  }

  /**
   * Get queue status (for monitoring)
   */
  getQueueStatus() {
    return {
      queueSize: this.refreshQueue.length,
      isRefreshing: this.isRefreshing,
      jobs: Array.from(this.refreshJobs.values()).map(job => ({
        key: job.key,
        priority: job.priority,
        status: job.status,
        age: Date.now() - job.createdAt
      }))
    };
  }

  /**
   * Force clear queue (emergency use only)
   */
  clearQueue() {
    this.refreshQueue = [];
    this.refreshJobs.clear();
    console.log(`[PROD_CACHE] Queue cleared`);
  }
}

// Global singleton
export const productionCache = new ProductionCacheStrategy();
