/**
 * Production API Wrapper
 * Simple wrapper for API routes to use production cache strategy
 * GUARANTEES: Users NEVER see rate limit errors
 */

import { productionCache } from './production-cache-strategy';
import { NextRequest, NextResponse } from 'next/server';

interface ProductionApiOptions {
  startDate: string;
  endDate: string;
  customerId?: string | null;
  accountIds?: string[];
  forceRefresh?: boolean;
  userId?: string;
  userType?: 'admin' | 'user' | 'guest';
}

/**
 * Get Google Ads data with production-grade caching
 * This is a simple wrapper that always returns data (never throws rate limit errors)
 */
export async function getGoogleAdsDataProduction(options: ProductionApiOptions) {
  const {
    startDate,
    endDate,
    customerId = null,
    accountIds = [],
    forceRefresh = false
  } = options;

  // Determine cache strategy based on date range
  const strategy = determineCacheStrategy(startDate, endDate);

  console.log(`[PROD_API] Request: ${startDate} to ${endDate}, strategy: ${strategy}`);

  // Handle multi-account requests
  if (accountIds && accountIds.length > 0) {
    console.log(`[PROD_API] Multi-account request: ${accountIds.length} accounts`);

    const results = await Promise.all(
      accountIds.map(accId =>
        productionCache.getData(startDate, endDate, accId, strategy)
      )
    );

    // Aggregate all account data
    const aggregatedData = {
      campaigns: [],
      ads: [],
      clicks: []
    };

    let oldestAge = 0;
    let isAnyRefreshing = false;

    results.forEach((result, index) => {
      const accountId = accountIds[index];

      if (result.data) {
        // Tag data with account ID
        if (result.data.campaigns) {
          result.data.campaigns.forEach((c: any) => c.account_id = accountId);
          aggregatedData.campaigns.push(...result.data.campaigns);
        }
        if (result.data.ads) {
          result.data.ads.forEach((a: any) => a.account_id = accountId);
          aggregatedData.ads.push(...result.data.ads);
        }
        if (result.data.clicks) {
          result.data.clicks.forEach((c: any) => c.account_id = accountId);
          aggregatedData.clicks.push(...result.data.clicks);
        }
      }

      oldestAge = Math.max(oldestAge, result.age);
      isAnyRefreshing = isAnyRefreshing || result.isRefreshing;
    });

    return {
      data: aggregatedData,
      source: results[0].source,
      age: oldestAge,
      isRefreshing: isAnyRefreshing,
      message: `Aggregated ${accountIds.length} accounts - ${results[0].message}`
    };
  }

  // Single account request
  return await productionCache.getData(startDate, endDate, customerId, strategy);
}

/**
 * Determine cache strategy based on date range
 */
function determineCacheStrategy(
  startDate: string,
  endDate: string
): 'realtime' | 'dashboard' | 'historical' {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Today only = realtime
  if (startDate === today && endDate === today) {
    return 'realtime';
  }

  // Last 7 days = dashboard
  if (startDate >= weekAgo && endDate >= yesterday) {
    return 'dashboard';
  }

  // Older data = historical
  return 'historical';
}

/**
 * Prefetch common queries (call this in background/cron)
 */
export async function warmupCache(accountIds: string[]) {
  console.log(`[PROD_API] 🔥 Warming up cache for ${accountIds.length} accounts...`);
  await productionCache.prefetchCommonQueries(accountIds);
  console.log(`[PROD_API] Cache warmup complete`);
}

/**
 * Get queue status for monitoring
 */
export function getProductionCacheStatus() {
  return productionCache.getQueueStatus();
}
