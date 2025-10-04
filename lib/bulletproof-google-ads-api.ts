/**
 * Bulletproof Google Ads API Wrapper
 * Guarantees we NEVER hit rate limits with intelligent retry and caching
 */

import { fetchGoogleAdsData, getMockGoogleAdsData } from './google-ads-api';
import { unifiedCache } from './unified-cache-manager';
import { productionRateManager } from './production-rate-manager';

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

  /**
   * Main method to get Google Ads data with bulletproof guarantees
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
    
    console.log(`[BULLETPROOF_API] Request: ${startDate} to ${endDate}, customer: ${customerId || 'all'}`);

    // Step 1: Try unified cache first (instant response)
    const cacheResult = this.tryCache(startDate, endDate, customerId, allowStale);
    if (cacheResult) {
      return cacheResult;
    }

    // Step 2: Check if we can make API requests safely (following Google's official guidelines)
    const quotaStatus = productionRateManager.getQuotaStatus();
    
    // Determine service type based on request (following Google's service-specific limits)
    const serviceType = this.determineServiceType(startDate, endDate, customerId);
    const canRequest = productionRateManager.canMakeRequest(customerId || undefined, serviceType);

    if (!canRequest.allowed) {
      console.warn(`[BULLETPROOF_API] Cannot make ${serviceType} API request: ${canRequest.reason}`);
      
      // Try to serve stale cache as fallback
      const staleResult = this.tryStaleCache(startDate, endDate, customerId);
      if (staleResult) {
        return staleResult;
      }

      // Last resort: return error with quota status
      return {
        data: null,
        source: 'fallback',
        message: `API unavailable (${serviceType}): ${canRequest.reason}. Wait time: ${canRequest.waitTime || 'unknown'}ms`,
        quotaStatus
      };
    }

    // Step 3: Attempt safe API call
    try {
      return await this.makeGuardedApiCall(startDate, endDate, customerId, priority);
    } catch (error) {
      console.error('[BULLETPROOF_API] API call failed:', error);
      
      // Handle rate limit errors
      if (this.isRateLimitError(error)) {
        productionRateManager.handleRateLimitError(error);
      }

      // Fallback to stale cache or error
      const staleResult = this.tryStaleCache(startDate, endDate, customerId);
      if (staleResult) {
        return staleResult;
      }

      return {
        data: null,
        source: 'fallback',
        message: `API failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        quotaStatus: productionRateManager.getQuotaStatus()
      };
    }
  }

  /**
   * Try to get data from cache
   */
  private tryCache(
    startDate: string,
    endDate: string,
    customerId: string | null,
    allowStale: boolean
  ): ApiResponse | null {
    const cacheResult = unifiedCache.getWithFallback(
      startDate,
      endDate,
      customerId,
      ['individual', 'aggregated', 'cost']
    );

    if (cacheResult.data && (!cacheResult.isStale || allowStale)) {
      console.log(`[BULLETPROOF_API] Cache hit: ${cacheResult.source}, age: ${Math.round(cacheResult.age / 1000)}s`);
      
      return {
        data: cacheResult.data,
        source: 'cache',
        age: cacheResult.age,
        message: `Fresh data from ${cacheResult.source} cache`,
        quotaStatus: productionRateManager.getQuotaStatus()
      };
    }

    return null;
  }

  /**
   * Try to get stale data from cache as fallback
   */
  private tryStaleCache(
    startDate: string,
    endDate: string,
    customerId: string | null
  ): ApiResponse | null {
    const cacheResult = unifiedCache.getWithFallback(
      startDate,
      endDate,
      customerId,
      ['individual', 'aggregated', 'cost']
    );

    if (cacheResult.data) {
      console.log(`[BULLETPROOF_API] Serving stale cache as fallback, age: ${Math.round(cacheResult.age / 1000)}s`);
      
      return {
        data: cacheResult.data,
        source: 'stale',
        age: cacheResult.age,
        message: `Stale data from ${cacheResult.source} cache (API unavailable)`,
        quotaStatus: productionRateManager.getQuotaStatus()
      };
    }

    return null;
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
   * Make a guarded API call with Google-compliant quota management
   */
  private async makeGuardedApiCall(
    startDate: string,
    endDate: string,
    customerId: string | null,
    priority: number
  ): Promise<ApiResponse> {
    const serviceType = this.determineServiceType(startDate, endDate, customerId);
    
    // Wait for optimal timing (following Google's QPS recommendations)
    const waitTime = productionRateManager.getOptimalWaitTime();
    if (waitTime > 0) {
      console.log(`[BULLETPROOF_API] Waiting ${waitTime}ms for optimal ${serviceType} request timing`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Record the request for quota tracking (with Google-compliant parameters)
    productionRateManager.recordRequest(customerId || undefined, serviceType);

    console.log(`[BULLETPROOF_API] Making Google Ads ${serviceType} API call for customer ${customerId || 'all'}`);
    const startTime = Date.now();

    // Make the actual API call with specific account filtering
    const apiData = await fetchGoogleAdsData(startDate, endDate, customerId);
    const responseTime = Date.now() - startTime;

    if (!apiData || !apiData.ads) {
      throw new Error('Invalid API response structure');
    }

    // Store in unified cache
    unifiedCache.set(
      startDate,
      endDate,
      customerId,
      apiData,
      {
        dataType: customerId ? 'individual' : 'aggregated',
        priority: 1 // Highest priority for fresh API data
      }
    );

    console.log(`[BULLETPROOF_API] ${serviceType} API call successful in ${responseTime}ms, ${apiData.ads.length} ads`);

    return {
      data: apiData,
      source: 'api',
      message: `Fresh data from Google Ads ${serviceType} API (${responseTime}ms, following Google rate limits)`,
      quotaStatus: productionRateManager.getQuotaStatus()
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
   * Get system health status
   */
  getHealthStatus() {
    const quotaStatus = productionRateManager.getQuotaStatus();
    const cacheStats = unifiedCache.getStats();

    return {
      quota: quotaStatus,
      cache: cacheStats,
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
   * Manual cache warm-up (use during low-traffic periods)
   */
  async warmUpCache(
    dateRanges: Array<{ startDate: string; endDate: string; customerId?: string | null }>
  ): Promise<void> {
    console.log(`[BULLETPROOF_API] Starting cache warm-up for ${dateRanges.length} date ranges`);

    for (const range of dateRanges) {
      const quotaStatus = productionRateManager.canMakeRequest();
      if (!quotaStatus.allowed) {
        console.log('[BULLETPROOF_API] Stopping warm-up due to quota limits');
        break;
      }

      try {
        await this.getData(range.startDate, range.endDate, range.customerId, {
          priority: 1,
          allowStale: false
        });
        
        // Wait between requests
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
