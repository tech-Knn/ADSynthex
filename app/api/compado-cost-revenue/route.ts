/**
 * Compado Cost/Revenue Mapping API
 * Maps Google Ads cost with Compado conversion revenue by GCLID
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllCompadoConversions,
  mapCompadoCostRevenue,
  aggregateMappingsByCampaign,
  getCompadoCostRevenueSummary,
  type CompadoCostRevenueMapping,
  type CompadoCostRevenueSummary
} from '@/lib/compado-api';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { redisCacheManager } from '@/lib/redis-cache-manager';
import { productionCache } from '@/lib/production-cache-strategy';
import { userRateLimiter } from '@/lib/user-rate-limiter';
import { googleAdsRateLimiter } from '@/lib/redis-rate-limiter';
import { cookies } from 'next/headers';
import { getDashboardFromMongoDB } from '@/lib/db/dashboard-helper';

interface CompadoCostRevenueResponse {
  google_ads_data: any;
  compado_data: any;
  cost_revenue_mapping: CompadoCostRevenueMapping[];
  campaign_aggregated: CompadoCostRevenueMapping[];
  summary: CompadoCostRevenueSummary;
  _source: string;
  _timestamp: string;
  _message: string;
  _dataFreshness?: {
    source: string;
    ageMinutes: number;
    isFresh: boolean;
    message: string;
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { startDate, endDate, customerId, accountIds, forceRefresh = false } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    // Authorization: Check if user has access to requested account(s)
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;
    const userAccountId = cookieStore.get('account_id')?.value;

    // For regular users (not admins), enforce account-level access control
    if (authType === 'user' && userAccountId) {
      // Normalize account ID format (ensure CID_ prefix)
      const normalizedUserAccountId = userAccountId.startsWith('CID_') ? userAccountId : `CID_${userAccountId}`;
      const accountValue = normalizedUserAccountId.replace('CID_', '');

      // Determine requested accounts
      const requestedAccounts = accountIds && Array.isArray(accountIds) && accountIds.length > 0
        ? accountIds
        : (customerId ? [customerId] : []);

      // Check if user is requesting data for accounts they don't own
      const unauthorizedAccess = requestedAccounts.some(accId => {
        const normalizedRequestedId = accId.startsWith('CID_') ? accId : `CID_${accId}`;
        const requestedValue = accId.toString();
        return normalizedRequestedId !== normalizedUserAccountId && requestedValue !== accountValue;
      });

      if (unauthorizedAccess) {
        console.log(`[COMPADO_COST_REVENUE] ⚠️  Access denied: User ${userAccountId} attempted to access unauthorized accounts`);
        return NextResponse.json(
          { error: 'Access denied: You can only view data for your own account' },
          { status: 403 }
        );
      }

      // Force the request to only include the user's account
      // Override any requested accounts with the user's account
      const requestBody = {
        ...body,
        customerId: accountValue,
        accountIds: undefined // Clear accountIds to prevent multi-account access
      };
      body.customerId = accountValue;
      body.accountIds = undefined;

      console.log(`[COMPADO_COST_REVENUE] 🔒 User ${userAccountId} accessing their own account data`);
    }

    // ==================== MONGODB FIRST: Check for fresh data (1-hour freshness) ====================
    // Professional Dashboard Strategy: Always use MongoDB if data is < 60 minutes old
    // Background sync worker runs every 1 hour to keep data fresh
    // Users see data that's max 1 hour old - perfect balance between freshness & API quota
    if (!forceRefresh) {
      console.log('[COMPADO_COST_REVENUE] 🔍 Checking MongoDB for fresh data (< 60 min)...');

      const accountToQuery = accountIds && Array.isArray(accountIds) && accountIds.length > 0
        ? accountIds
        : (customerId || 'all');

      const mongoData = await getDashboardFromMongoDB(
        'compado',
        accountToQuery,
        startDate,
        endDate,
        60 // Accept data up to 60 minutes old (1-hour freshness)
      );

      if (mongoData) {
        const nextSyncMinutes = 60 - (mongoData.age % 60);
        const isFresh = mongoData.age <= 60;

        console.log(`[COMPADO_COST_REVENUE] ✅ Returning MongoDB data (${mongoData.age} min old, next sync in ${nextSyncMinutes} min)`);

        return NextResponse.json({
          cost_revenue_mapping: mongoData.data.cost_revenue_mapping,
          campaign_aggregated: mongoData.data.campaign_aggregated || [],
          summary: mongoData.data.summary,
          _source: 'mongodb',
          _timestamp: new Date().toISOString(),
          _message: `Data from MongoDB (${mongoData.age} minutes old). Sync runs every hour.`,
          _dataFreshness: {
            source: 'mongodb',
            ageMinutes: mongoData.age,
            isFresh,
            nextSyncInMinutes: nextSyncMinutes,
            message: `Data is ${mongoData.age} min old. Next sync in ~${nextSyncMinutes} min.`,
            cronSchedule: 'Every hour'
          }
        });
      }

      console.log('[COMPADO_COST_REVENUE] ⚠️  MongoDB data stale (>60 min) or missing, checking Redis aggregated cache...');
    } else {
      console.log('[COMPADO_COST_REVENUE] 🔄 Force refresh requested - skipping MongoDB and Redis cache...');
    }

    // Determine if we're processing multiple accounts (needed for cache key generation)
    const isMultiAccount = accountIds && Array.isArray(accountIds) && accountIds.length > 0;

    // ==================== REDIS AGGREGATED CACHE: Check for cached aggregated results ====================
    // This cache stores only the final aggregated data (campaign_aggregated + summary)
    // Size: ~50-200KB instead of 10-20MB raw data - fits in Redis easily!
    const aggregatedCacheKey = `compado-agg:${isMultiAccount ? accountIds?.join(',') : (customerId || 'all')}:${startDate}:${endDate}`;

    if (!forceRefresh) {
      const cachedAggregated = await redisCacheManager.get(aggregatedCacheKey, { dataType: 'compado' });

      if (cachedAggregated.data) {
        console.log(`[COMPADO_COST_REVENUE] ✅ Serving cached aggregated data (${Math.round(cachedAggregated.age / 1000)}s old)`);
        return NextResponse.json({
          campaign_aggregated: cachedAggregated.data.campaign_aggregated,
          summary: cachedAggregated.data.summary,
          google_ads_data: cachedAggregated.data.google_ads_data || {},
          compado_data: cachedAggregated.data.compado_data || {},
          cost_revenue_mapping: [],
          _source: 'redis-aggregated-cache',
          _timestamp: new Date().toISOString(),
          _message: `Cached aggregated data (${Math.round(cachedAggregated.age / 1000)}s old)`,
          _dataFreshness: {
            source: 'redis',
            ageMinutes: Math.round(cachedAggregated.age / 60000),
            isFresh: cachedAggregated.age < 1800000, // < 30 min
            message: `Aggregated cache (${Math.round(cachedAggregated.age / 60000)} min old)`
          }
        });
      }
    }

    console.log('[COMPADO_COST_REVENUE] ⚠️  No aggregated cache, fetching from API...');

    // Build list of accounts to process
    const accountsToProcess = isMultiAccount ? accountIds : (customerId ? [customerId] : []);

    // Calculate date range size
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`[COMPADO_COST_REVENUE] Mapping request: ${startDate} to ${endDate} (${daysDiff} days), Accounts: ${isMultiAccount ? accountIds.join(', ') : (customerId || 'all')}, forceRefresh: ${forceRefresh}`);

    // OPTIMIZATION: Warn about large date ranges
    if (daysDiff > 30) {
      console.warn(`[COMPADO_COST_REVENUE] ⚠️  Large date range detected: ${daysDiff} days. This may take longer to load.`);
      console.warn(`[COMPADO_COST_REVENUE] TIP: Use smaller date ranges (7-14 days) for faster loading.`);
    }

    let message = '';

    try {
      // BULLETPROOF RATE LIMIT PROTECTION: Check quota status first
      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();
      console.log(`[COMPADO_COST_REVENUE] 🛡️ Quota status: ${quotaStatus.dailyUsed}/${quotaStatus.dailyLimit} daily, ${quotaStatus.hourlyUsed}/${quotaStatus.hourlyLimit} hourly`);

      // CRITICAL: If quota is getting close to limit, deny forceRefresh
      let actualForceRefresh = forceRefresh;
      if (quotaStatus.usagePercentage > 90) {
        console.warn(`[COMPADO_COST_REVENUE] 🚨 Quota usage at ${quotaStatus.usagePercentage}% - BLOCKING forceRefresh to protect quota`);
        actualForceRefresh = false;
      }

      // Check if we're in cooldown BEFORE clearing cache
      const quotaCheck = await googleAdsRateLimiter.canMakeRequest();

      // CRITICAL: If in cooldown, IGNORE forceRefresh to prevent errors
      if (actualForceRefresh && !quotaCheck.allowed) {
        console.warn(`[COMPADO_COST_REVENUE] 🛡️ COOLDOWN ACTIVE - Ignoring forceRefresh to serve cached data`);
        console.warn(`[COMPADO_COST_REVENUE] Reason: ${quotaCheck.reason}`);
        actualForceRefresh = false; // Override to protect user experience
      }

      // OPTIMISTIC CACHING: Always prefer stale cache over fresh API calls
      // This ensures we NEVER hit rate limits even under heavy load
      const shouldUseStaleCache = !actualForceRefresh || quotaStatus.usagePercentage > 80;
      if (shouldUseStaleCache && !actualForceRefresh) {
        console.log(`[COMPADO_COST_REVENUE] 🎯 Using optimistic caching strategy (quota: ${quotaStatus.usagePercentage}%)`);
      }

      // Clear cache if forceRefresh is requested AND we're not in cooldown
      if (actualForceRefresh) {
        const accountsToClear = isMultiAccount ? accountIds : (customerId ? [customerId] : []);
        for (const accId of accountsToClear) {
          console.log(`[COMPADO_COST_REVENUE] ⚡ Clearing cache for account ${accId} to ensure fresh data...`);
          try {
            const { redisClient } = await import('@/lib/redis-client');
            // Match the cache key format used by redisCacheManager.generateKey() with feedType
            const cacheKey = `cache:google-ads:${accId}:${startDate}:${endDate}:compado`;
            await redisClient.del(cacheKey);
            console.log(`[COMPADO_COST_REVENUE] ✓ Cleared cache key: ${cacheKey}`);

            // Also clear the old format without feedType for backward compatibility
            const oldCacheKey = `cache:google-ads:${accId}:${startDate}:${endDate}`;
            await redisClient.del(oldCacheKey);
          } catch (cacheError) {
            console.warn(`[COMPADO_COST_REVENUE] ⚠️  Failed to clear cache:`, cacheError);
          }
        }
      }

      // PERFORMANCE OPTIMIZATION: Fetch Google Ads and Compado data IN PARALLEL
      console.log('[COMPADO_COST_REVENUE] 🚀 Fetching Google Ads + Compado data in PARALLEL...');
      console.log(`[COMPADO_COST_REVENUE] Date range: ${daysDiff} days - ${daysDiff <= 7 ? '⚡ Fast' : daysDiff <= 14 ? '⏱️ Medium' : '🐌 Slow (consider smaller range)'}`);
      const fetchStartTime = Date.now();

      let googleAdsDataPromises;

      if (isMultiAccount) {
        // OPTIMIZATION: Batch parallel fetching to avoid rate limit queue buildup
        // Increased batch size from 3 to 5 for better performance (still conservative for rate limits)
        // Rate limiter enforces 2 QPS with circuit breaker protection
        // 5 accounts per batch = faster processing while staying under limits
        const BATCH_SIZE = 5;
        console.log(`[COMPADO_COST_REVENUE] Fetching data for ${accountIds.length} accounts in batches of ${BATCH_SIZE} (rate-limit safe)...`);

        // RATE LIMIT PROTECTION: Always allow stale for multi-account to minimize API calls
        const allowStaleForMulti = true; // CRITICAL: Always prefer cache for multi-account

        // OPTIMIZATION: Increase timeout for large date ranges
        const maxWaitTime = daysDiff > 14 ? 30000 : daysDiff > 7 ? 20000 : 10000;
        console.log(`[COMPADO_COST_REVENUE] Max wait time: ${maxWaitTime}ms for ${daysDiff}-day range`);

        // Process accounts in batches
        const allAccountsData: any[] = [];
        for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
          const batch = accountIds.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(accountIds.length / BATCH_SIZE);

          console.log(`[COMPADO_COST_REVENUE] 🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} accounts)...`);
          const batchStartTime = Date.now();

          const batchResults = await Promise.all(
            batch.map((accId, index) => {
              const globalIndex = i + index + 1;
              console.log(`[COMPADO_COST_REVENUE] Starting fetch ${globalIndex}/${accountIds.length}: Account ${accId}`);
              return bulletproofAPI.getData(startDate, endDate, accId, {
                priority: 8,
                allowStale: allowStaleForMulti, // CRITICAL: Always true for multi-account protection
                maxWait: maxWaitTime, // Dynamic timeout based on date range
                feedType: 'compado' // CRITICAL: ONLY fetch Compado accounts
              });
            })
          );

          allAccountsData.push(...batchResults);

          const batchTime = Date.now() - batchStartTime;
          console.log(`[COMPADO_COST_REVENUE] ✓ Batch ${batchNum}/${totalBatches} completed in ${(batchTime / 1000).toFixed(1)}s`);
        }

        googleAdsDataPromises = Promise.resolve(allAccountsData);
      } else {
        // Single account fetch - USE ACTUAL DATE RANGE (like AFS/Ads.com)
        // RATE LIMIT PROTECTION: Prefer stale cache unless explicitly forcing refresh
        const allowStaleSingle = !actualForceRefresh || quotaStatus.usagePercentage > 75;

        // OPTIMIZATION: Increase timeout for large date ranges
        const maxWaitTime = daysDiff > 14 ? 30000 : daysDiff > 7 ? 20000 : 10000;

        googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
          priority: 8,
          allowStale: allowStaleSingle, // CRITICAL: Protect against rate limits
          maxWait: maxWaitTime, // Dynamic timeout based on date range
          feedType: 'compado' // CRITICAL: ONLY fetch Compado accounts
        });
      }

      const [googleAdsResult, compadoConversions] = await Promise.allSettled([
        googleAdsDataPromises,
        fetchAllCompadoConversions(startDate, endDate)
      ]);

      const fetchTime = Date.now() - fetchStartTime;
      const fetchTimeSeconds = (fetchTime / 1000).toFixed(1);
      console.log(`[COMPADO_COST_REVENUE] ⚡ Parallel fetch completed in ${fetchTime}ms (${fetchTimeSeconds}s)`);

      // PERFORMANCE INSIGHT: Log fetch speed rating
      if (fetchTime < 5000) {
        console.log(`[COMPADO_COST_REVENUE] 🚀 Excellent speed! < 5s`);
      } else if (fetchTime < 15000) {
        console.log(`[COMPADO_COST_REVENUE] ✅ Good speed: ${fetchTimeSeconds}s`);
      } else if (fetchTime < 30000) {
        console.log(`[COMPADO_COST_REVENUE] ⏱️ Moderate speed: ${fetchTimeSeconds}s - Consider smaller date ranges`);
      } else {
        console.log(`[COMPADO_COST_REVENUE] 🐌 Slow speed: ${fetchTimeSeconds}s - Use smaller date ranges for faster loading`);
      }

      // Handle Google Ads result
      if (googleAdsResult.status === 'rejected') {
        console.error('[COMPADO_COST_REVENUE] ❌ Google Ads fetch failed:', googleAdsResult.reason);
        throw new Error(`Google Ads API failed: ${googleAdsResult.reason}`);
      }

      // Aggregate data from multiple accounts if needed
      let googleAdsData: any;
      if (isMultiAccount) {
        const accountsData = googleAdsResult.value as any[];
        console.log(`[COMPADO_COST_REVENUE] Aggregating data from ${accountsData.length} accounts...`);

        // Merge all accounts' data
        googleAdsData = {
          campaigns: [],
          ads: [],
          clicks: []
        };

        accountsData.forEach((accountResult: any, index: number) => {
          const accData = accountResult.data;
          const accountId = accountIds[index];
          console.log(`[COMPADO_COST_REVENUE]   Account ${index + 1} (${accountId}): ${accData?.campaigns?.length || 0} campaigns, ${accData?.clicks?.length || 0} clicks`);

          // Tag campaigns with account_id for tracking
          if (accData?.campaigns) {
            accData.campaigns.forEach((c: any) => c.account_id = accountId);
            // Use concat instead of spread to avoid stack overflow with large arrays
            googleAdsData.campaigns = googleAdsData.campaigns.concat(accData.campaigns);
          }

          // Tag ads with account_id for tracking
          if (accData?.ads) {
            accData.ads.forEach((a: any) => a.account_id = accountId);
            // Use concat instead of spread to avoid stack overflow with large arrays
            googleAdsData.ads = googleAdsData.ads.concat(accData.ads);
          }

          // Tag clicks with account_id for tracking
          if (accData?.clicks) {
            accData.clicks.forEach((c: any) => c.account_id = accountId);
            // Use concat instead of spread to avoid stack overflow with large arrays
            googleAdsData.clicks = googleAdsData.clicks.concat(accData.clicks);
          }
        });

        message += `Google Ads: ${accountsData.length} accounts aggregated (${fetchTime}ms). `;
      } else {
        const singleResult = googleAdsResult.value as any;
        googleAdsData = singleResult.data;
        message += `Google Ads: ${singleResult.message} (${fetchTime}ms). `;

        // For single account, log campaign details to verify account separation
        if (googleAdsData?.campaigns && googleAdsData.campaigns.length > 0) {
          console.log(`[COMPADO_COST_REVENUE] Single account (${customerId}) campaigns:`);
          googleAdsData.campaigns.slice(0, 3).forEach((c: any, i: number) => {
            console.log(`[COMPADO_COST_REVENUE]   ${i + 1}. ${c.campaign_name} (ID: ${c.campaign_id}) - Cost: $${c.metrics?.cost || 0}`);
          });
        }
      }

      // Validate Google Ads data
      if (!googleAdsData || (!googleAdsData.campaigns && !googleAdsData.clicks)) {
        console.error('[COMPADO_COST_REVENUE] ❌ No Google Ads data received from API!');
        console.error('[COMPADO_COST_REVENUE] googleAdsData:', googleAdsData);
        throw new Error('Failed to fetch Google Ads data - API returned empty response');
      }

      const totalClicks = googleAdsData?.clicks?.length || 0;
      const totalCampaigns = googleAdsData?.campaigns?.length || 0;

      console.log(`[COMPADO_COST_REVENUE] ✓ Live Google Ads API data received:`, {
        campaigns: totalCampaigns,
        ads: googleAdsData?.ads?.length || 0,
        clicks: totalClicks,
        fetchTime: `${fetchTime}ms`
      });

      // Warn about large datasets
      if (totalClicks > 100000) {
        console.warn(`[COMPADO_COST_REVENUE] ⚠️  Large dataset detected: ${totalClicks} clicks. Processing may take longer...`);
      }

      // DIAGNOSTIC: Check if campaigns is empty for date ranges
      if (googleAdsData?.campaigns?.length === 0) {
        console.warn(`[COMPADO_COST_REVENUE] ⚠️  ZERO CAMPAIGNS returned for date range: ${startDate} to ${endDate}`);
        console.warn(`[COMPADO_COST_REVENUE] This will result in "No Conversion Data Available" message`);
        console.warn(`[COMPADO_COST_REVENUE] Possible causes:`);
        console.warn(`[COMPADO_COST_REVENUE]   1. No campaigns ran during this period`);
        console.warn(`[COMPADO_COST_REVENUE]   2. Campaigns exist but have zero metrics`);
        console.warn(`[COMPADO_COST_REVENUE]   3. Cache serving old empty data`);
        console.warn(`[COMPADO_COST_REVENUE]   4. Google Ads API query filtering too strictly`);
      }

      // Handle Compado result
      let compadoData: any[] = [];
      if (compadoConversions.status === 'fulfilled') {
        compadoData = compadoConversions.value;

        // Calculate total Compado revenue for verification
        const totalCompadoRevenueEur = compadoData.reduce((sum, c) => sum + (c.revenue || 0), 0);
        const totalCompadoRevenueUsd = compadoData.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);

        console.log(`[COMPADO_COST_REVENUE] ✓ Compado conversions: ${compadoData.length}`);
        console.log(`[COMPADO_COST_REVENUE] ✓ Total Compado revenue: €${totalCompadoRevenueEur.toFixed(2)} → $${totalCompadoRevenueUsd.toFixed(2)}`);
        console.log(`[COMPADO_COST_REVENUE] ✓ Expected final revenue after GCLID matching: ~$${totalCompadoRevenueUsd.toFixed(2)}`);

        message += `Compado: ${compadoData.length} conversions, $${totalCompadoRevenueUsd.toFixed(2)} revenue. `;
      } else {
        console.warn('[COMPADO_COST_REVENUE] ⚠️  Compado fetch failed:', compadoConversions.reason);
        message += 'Compado: API error. ';
      }

      // MEMORY OPTIMIZATION: Build metrics maps with progress tracking
      const processingStart = Date.now();
      console.log(`[COMPADO_COST_REVENUE] 📊 Processing ${totalCampaigns} campaigns, ${totalClicks} clicks...`);

      const campaignMetricsMap = buildCampaignMetricsMap(googleAdsData?.campaigns || [], customerId || 'multi');
      const adGroupMetricsMap = buildAdGroupMetricsMap(googleAdsData?.ads || []);

      console.log(`[COMPADO_COST_REVENUE] ✓ Metrics maps built: ${campaignMetricsMap.size} campaigns, ${adGroupMetricsMap.size} ad groups`);

      // DIAGNOSTIC: Log if we have zero-cost campaigns
      if (campaignMetricsMap.size > 0) {
        let zeroCostCampaigns = 0;
        campaignMetricsMap.forEach((metrics) => {
          if (metrics.total_cost === 0) zeroCostCampaigns++;
        });
        if (zeroCostCampaigns > 0) {
          console.warn(`[COMPADO_COST_REVENUE] ⚠️  ${zeroCostCampaigns}/${campaignMetricsMap.size} campaigns have zero cost`);
        }
      }

      // Extract and enrich clicks
      const googleAdsClicks = enrichClicksWithCost(
        googleAdsData?.clicks || [],
        campaignMetricsMap,
        adGroupMetricsMap,
        startDate
      );

      console.log(`[COMPADO_COST_REVENUE] Enriched ${googleAdsClicks.length} clicks from ${startDate} to ${endDate} for GCLID matching`);

      const processingTime = Date.now() - processingStart;
      const processingSeconds = (processingTime / 1000).toFixed(1);
      console.log(`[COMPADO_COST_REVENUE] ⚡ Data processing completed in ${processingTime}ms (${processingSeconds}s)`);

      // PERFORMANCE SUMMARY
      const totalTime = Date.now() - startTime;
      const totalSeconds = (totalTime / 1000).toFixed(1);
      console.log(`[COMPADO_COST_REVENUE] ==================== PERFORMANCE SUMMARY ====================`);
      console.log(`[COMPADO_COST_REVENUE] Total time: ${totalSeconds}s`);
      console.log(`[COMPADO_COST_REVENUE]   - Fetch: ${fetchTimeSeconds}s (${((fetchTime / totalTime) * 100).toFixed(0)}%)`);
      console.log(`[COMPADO_COST_REVENUE]   - Processing: ${processingSeconds}s (${((processingTime / totalTime) * 100).toFixed(0)}%)`);
      console.log(`[COMPADO_COST_REVENUE] Data volume: ${totalClicks.toLocaleString()} clicks, ${totalCampaigns} campaigns`);
      console.log(`[COMPADO_COST_REVENUE] Speed rating: ${totalTime < 10000 ? '🚀 Excellent' : totalTime < 30000 ? '✅ Good' : totalTime < 60000 ? '⏱️ Moderate' : '🐌 Slow'}`);
      console.log(`[COMPADO_COST_REVENUE] ===========================================================`);

      // Simplified cost statistics logging (performance optimization)
      const clicksWithCost = googleAdsClicks.filter((c: any) => c.cost > 0);
      const totalCost = googleAdsClicks.reduce((sum: number, c: any) => sum + c.cost, 0);
      console.log(`[COMPADO_COST_REVENUE] Cost mapping: ${googleAdsClicks.length} clicks, ${clicksWithCost.length} with cost, total: $${totalCost.toFixed(2)}`);

      // 3. Map cost and revenue by GCLID with progress tracking
      console.log(`[COMPADO_COST_REVENUE] 🔗 Creating cost-revenue mapping (${googleAdsClicks.length} clicks × ${compadoData.length} conversions)...`);

      // Build and cache campaign names for future use (even during rate limits)
      const campaignNamesMap = new Map<string, string>();
      (googleAdsData?.campaigns || []).forEach((campaign: any) => {
        if (campaign.campaign_id && campaign.campaign_name) {
          campaignNamesMap.set(String(campaign.campaign_id), campaign.campaign_name);
        }
      });

      // Cache campaign names in Redis for 7 days (persist across rate limits)
      if (campaignNamesMap.size > 0) {
        try {
          // For multi-account, cache under a combined key
          const cacheKey = isMultiAccount
            ? `campaign-names:multi:${accountIds.join('-')}`
            : `campaign-names:${customerId}`;
          const campaignNamesObj = Object.fromEntries(campaignNamesMap);
          await redisCacheManager.set(cacheKey, campaignNamesObj, {
            dataType: 'google-ads',
            ttl: 604800
          }); // 7 days
          console.log(`[COMPADO_COST_REVENUE] Cached ${campaignNamesMap.size} campaign names for future use`);
        } catch (err) {
          console.warn('[COMPADO_COST_REVENUE] Failed to cache campaign names:', err);
        }
      } else {
        // Try to load cached campaign names if no fresh data
        try {
          const cacheKey = isMultiAccount
            ? `campaign-names:multi:${accountIds.join('-')}`
            : `campaign-names:${customerId}`;
          const cached = await redisCacheManager.get(cacheKey, { dataType: 'google-ads' });
          if (cached.data) {
            Object.entries(cached.data).forEach(([id, name]) => {
              campaignNamesMap.set(id, name as string);
            });
            console.log(`[COMPADO_COST_REVENUE] Loaded ${campaignNamesMap.size} campaign names from cache`);
          }
        } catch (err) {
          console.warn('[COMPADO_COST_REVENUE] Failed to load cached campaign names:', err);
        }
      }

      const costRevenueMapping = mapCompadoCostRevenue(googleAdsClicks, compadoData, campaignNamesMap);

      // 4. Aggregate by campaign for easier viewing (using LIVE data only)
      console.log('[COMPADO_COST_REVENUE] Aggregating by campaign using LIVE API data...');

      // Validate we're using live campaign data
      if (campaignMetricsMap.size === 0) {
        console.warn('[COMPADO_COST_REVENUE] ⚠️  No campaign metrics available - campaigns may show with zero cost');
      } else {
        console.log(`[COMPADO_COST_REVENUE] ✓ Using ${campaignMetricsMap.size} campaigns from LIVE Google Ads API`);
      }

      // Log campaign-level totals before aggregation (for validation)
      let totalCampaignLevelCost = 0;
      if (campaignMetricsMap) {
        campaignMetricsMap.forEach((data) => {
          totalCampaignLevelCost += data.total_cost || 0;
        });
        console.log(`[COMPADO_COST_REVENUE] Campaign-level total cost (from Google Ads): $${totalCampaignLevelCost.toFixed(2)}`);
      }

      const campaignAggregated = aggregateMappingsByCampaign(costRevenueMapping, campaignMetricsMap);
      console.log(`[COMPADO_COST_REVENUE] ✓ Campaign aggregation complete: ${campaignAggregated.length} campaigns with LIVE data`);

      // VALIDATION: Check if aggregated costs match campaign-level costs
      const aggregatedTotalCost = campaignAggregated.reduce((sum, c) => sum + c.cost, 0);
      const campaignLevelCost = totalCampaignLevelCost || 0;
      const costDifference = aggregatedTotalCost - campaignLevelCost;
      const costDifferencePercent = campaignLevelCost > 0 ? (costDifference / campaignLevelCost) * 100 : 0;

      console.log(`[COMPADO_COST_REVENUE] Cost validation:`);
      console.log(`[COMPADO_COST_REVENUE]   - Campaign-level total: $${campaignLevelCost.toFixed(2)}`);
      console.log(`[COMPADO_COST_REVENUE]   - Aggregated total: $${aggregatedTotalCost.toFixed(2)}`);
      console.log(`[COMPADO_COST_REVENUE]   - Difference: $${costDifference.toFixed(2)} (${costDifferencePercent.toFixed(1)}%)`);

      if (Math.abs(costDifferencePercent) > 5) {
        console.warn(`[COMPADO_COST_REVENUE] ⚠️⚠️⚠️  COST MISMATCH > 5% - Check aggregation logic!`);
      }

      // Log what campaigns we're returning
      if (campaignAggregated.length > 0) {
        console.log(`[COMPADO_COST_REVENUE] Campaigns being returned to frontend:`);
        campaignAggregated.forEach((camp, idx) => {
          console.log(`[COMPADO_COST_REVENUE]   ${idx + 1}. ${camp.campaign_name} | Cost: $${camp.cost.toFixed(2)} | Conversions: ${camp.conversions} | Revenue: $${camp.revenue.toFixed(2)}`);
        });

        // DIAGNOSTIC: Check how many have conversions
        const campaignsWithConversions = campaignAggregated.filter(c => c.conversions > 0);
        const campaignsWithRevenue = campaignAggregated.filter(c => c.revenue > 0);
        console.log(`[COMPADO_COST_REVENUE] Campaign breakdown: ${campaignsWithConversions.length} with conversions, ${campaignsWithRevenue.length} with revenue, ${campaignAggregated.length} total`);
      } else {
        console.warn(`[COMPADO_COST_REVENUE] ⚠️⚠️⚠️  NO CAMPAIGNS in aggregated data - dashboard will show "No Conversion Data Available"!`);
        console.warn(`[COMPADO_COST_REVENUE] Date range: ${startDate} to ${endDate}`);
        console.warn(`[COMPADO_COST_REVENUE] Google Ads campaigns fetched: ${googleAdsData?.campaigns?.length || 0}`);
        console.warn(`[COMPADO_COST_REVENUE] Compado conversions fetched: ${compadoData.length}`);
        console.warn(`[COMPADO_COST_REVENUE] Cost-revenue mappings created: ${costRevenueMapping.length}`);
      }

      // 5. Generate summary statistics from aggregated campaign data
      const totalCostFromCampaigns = campaignAggregated.reduce((sum, c) => sum + c.cost, 0);
      const totalRevenueFromCampaigns = campaignAggregated.reduce((sum, c) => sum + c.revenue, 0);
      const totalConversionsFromCampaigns = campaignAggregated.reduce((sum, c) => sum + c.conversions, 0);

      const summary = getCompadoCostRevenueSummary(costRevenueMapping);

      console.log(`[COMPADO_COST_REVENUE] ✅ Mapping complete:`, {
        click_level_mappings: costRevenueMapping.length,
        campaigns: campaignAggregated.length,
        total_cost: `$${totalCostFromCampaigns.toFixed(2)}`,
        total_revenue: `$${totalRevenueFromCampaigns.toFixed(2)}`,
        total_conversions: totalConversionsFromCampaigns,
        profit: `$${(totalRevenueFromCampaigns - totalCostFromCampaigns).toFixed(2)}`
      });

      // Calculate data freshness for user awareness
      const firstResult = isMultiAccount && Array.isArray(googleAdsResult.value) ? googleAdsResult.value[0] : googleAdsResult.value;
      const dataAge = (firstResult as any)?.age || 0;
      const dataSource = (firstResult as any)?.source || 'unknown';
      const freshnessMinutes = Math.round(dataAge / 60000);

      const response: CompadoCostRevenueResponse = {
        google_ads_data: {
          clicks: [], // Don't send 276K+ clicks to frontend! Only send aggregated data
          total_clicks: googleAdsClicks.length,
          total_cost: totalCost
        },
        compado_data: {
          conversions: [], // Don't send all conversions to frontend! Only send aggregated data
          total_conversions: compadoData.length,
          total_revenue: compadoData.reduce((sum: number, c: any) => sum + (c.revenueUsd || 0), 0)
        },
        cost_revenue_mapping: [], // Don't send massive mappings - only campaign_aggregated needed
        campaign_aggregated: campaignAggregated,
        summary,
        _source: 'compado_google_ads_mapping',
        _timestamp: new Date().toISOString(),
        _message: message.trim(),
        _dataFreshness: {
          source: dataSource,
          ageMinutes: freshnessMinutes,
          isFresh: freshnessMinutes < 30,
          message: dataSource === 'cache' ? `Data from cache (${freshnessMinutes} min old)` : 'Fresh from API'
        }
      };

      // ==================== CACHE AGGREGATED RESULTS ====================
      // Cache only the small aggregated data (50-200KB) instead of raw clicks/conversions (10-20MB)
      console.log('[COMPADO_COST_REVENUE] Caching aggregated results...');
      const cachePayload = {
        campaign_aggregated: campaignAggregated,
        summary: summary,
        google_ads_data: response.google_ads_data,
        compado_data: response.compado_data
      };

      try {
        await redisCacheManager.set(aggregatedCacheKey, cachePayload, {
          dataType: 'compado',
          ttl: 1800 // 30 minutes - shorter than 1-hour sync to ensure fresh data after sync
        });

        const cacheSize = JSON.stringify(cachePayload).length / 1024;
        console.log(`[COMPADO_COST_REVENUE] ✓ Cached aggregated results: ${cacheSize.toFixed(2)}KB (TTL: 30 min)`);
      } catch (cacheError: any) {
        console.error(`[COMPADO_COST_REVENUE] ⚠️  Failed to cache aggregated results:`, cacheError.message);
        // Continue even if caching fails
      }

      // Log response size for monitoring
      console.log(`[COMPADO_COST_REVENUE] 📦 Response optimized: Sending ${campaignAggregated.length} campaigns (not ${googleAdsClicks.length} clicks + ${compadoData.length} conversions)`);

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, max-age=300'
        }
      });

    } catch (dataError) {
      console.error('[COMPADO_COST_REVENUE] Data fetching failed:', dataError);

      // Return empty result on error
      const emptyResponse: CompadoCostRevenueResponse = {
        google_ads_data: { clicks: [], total_clicks: 0, total_cost: 0 },
        compado_data: { conversions: [], total_conversions: 0, total_revenue: 0 },
        cost_revenue_mapping: [],
        campaign_aggregated: [],
        summary: {
          totalCost: 0,
          totalRevenue: 0,
          totalProfit: 0,
          totalConversions: 0,
          totalClicks: 0,
          totalImpressions: 0,
          overallROI: 0,
          overallROAS: 0,
          averageConversionRate: 0,
          profitableCampaigns: 0,
          totalCampaigns: 0,
          profitabilityRate: 0
        },
        _source: 'error_fallback',
        _timestamp: new Date().toISOString(),
        _message: `Data fetch failed: ${dataError instanceof Error ? dataError.message : 'Unknown error'}`
      };

      return NextResponse.json(emptyResponse, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

  } catch (error) {
    console.error('[COMPADO_COST_REVENUE] Request processing error:', error);

    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      _loadTime: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  try {
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}


/**
 * MEMORY OPTIMIZED: Build campaign metrics map
 */
function buildCampaignMetricsMap(campaigns: any[], accountContext: string = 'unknown'): Map<string, any> {
  const map = new Map<string, any>();

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    const campaignId = String(campaign.campaign_id);

    if (campaignId && campaignId !== 'undefined') {
      const totalCost = campaign.metrics?.cost || 0;
      const totalClicks = campaign.metrics?.clicks || 0;
      const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;

      map.set(campaignId, {
        campaign_name: campaign.campaign_name,
        total_cost: totalCost,
        total_clicks: totalClicks,
        cpc: cpc,
        impressions: campaign.metrics?.impressions || 0,
        account_id: campaign.account_id || accountContext  // Track which account this came from
      });
    }
  }

  console.log(`[COMPADO_COST_REVENUE] Built ${map.size} campaign metrics for account context: ${accountContext}`);
  return map;
}

/**
 * MEMORY OPTIMIZED: Build ad group metrics map
 */
function buildAdGroupMetricsMap(ads: any[]): Map<string, any> {
  const map = new Map<string, any>();

  for (let i = 0; i < ads.length; i++) {
    const ad = ads[i];
    const adGroupId = String(ad.ad_group_id);

    if (adGroupId && adGroupId !== 'undefined') {
      const existing = map.get(adGroupId);
      const totalCost = (existing?.cost || 0) + (ad.metrics?.cost || 0);
      const totalClicks = (existing?.clicks || 0) + (ad.metrics?.clicks || 1);
      const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;

      map.set(adGroupId, {
        campaign_id: String(ad.campaign_id),
        campaign_name: ad.campaign_name,
        ad_group_name: ad.ad_group_name,
        cost: totalCost,
        clicks: totalClicks,
        impressions: (existing?.impressions || 0) + (ad.metrics?.impressions || 0),
        cpc: cpc
      });
    }
  }

  console.log(`[COMPADO_COST_REVENUE] Built ${map.size} ad group metrics`);
  return map;
}

/**
 * MEMORY OPTIMIZED: Enrich clicks with cost data
 */
function enrichClicksWithCost(
  clicks: any[],
  campaignMetricsMap: Map<string, any>,
  adGroupMetricsMap: Map<string, any>,
  startDate: string
): any[] {
  const enriched = [];

  for (let i = 0; i < clicks.length; i++) {
    const click = clicks[i];
    const adGroupIdStr = String(click.ad_group_id);
    const campaignIdStr = String(click.campaign_id);

    let metrics = adGroupMetricsMap.get(adGroupIdStr);
    let costPerClick = 0;
    let source = 'none';

    if (metrics && metrics.cpc > 0) {
      costPerClick = metrics.cpc;
      source = 'ad-group-level';
    } else {
      const campaignMetrics = campaignMetricsMap.get(campaignIdStr);
      if (campaignMetrics && campaignMetrics.cpc > 0) {
        costPerClick = campaignMetrics.cpc;
        metrics = {
          campaign_id: campaignIdStr,
          campaign_name: campaignMetrics.campaign_name,
          ad_group_id: adGroupIdStr,
          ad_group_name: click.ad_group_name,
          cost: campaignMetrics.total_cost,
          clicks: campaignMetrics.total_clicks,
          impressions: campaignMetrics.impressions,
          cpc: campaignMetrics.cpc
        };
        source = 'campaign-level';
      } else {
        metrics = {
          campaign_id: campaignIdStr,
          campaign_name: click.campaign_name,
          ad_group_id: adGroupIdStr,
          ad_group_name: click.ad_group_name,
          cost: 0,
          clicks: 1,
          impressions: 0,
          cpc: 0
        };
        source = 'none';
      }
    }

    enriched.push({
      gclid: click.gclid,
      campaign_id: String(click.campaign_id || metrics.campaign_id || 'unknown'),
      campaign_name: click.campaign_name || metrics.campaign_name || `Campaign ${click.campaign_id}`,
      ad_group_id: String(click.ad_group_id || 'unknown'),
      ad_group_name: click.ad_group_name || metrics.ad_group_name || 'unknown',
      cost: costPerClick,
      clicks: 1,
      impressions: 1,
      date: click.date || startDate,
      _costSource: source
    });
  }

  console.log(`[COMPADO_COST_REVENUE] Enriched ${enriched.length} clicks`);
  return enriched;
}
