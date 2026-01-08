/**
 * Predicto Cost/Revenue Mapping API
 * Maps Google Ads cost with Predicto revenue by campaign_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';
import { calculateSummary } from '@/lib/predicto-channel-mapper';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { redisCacheManager } from '@/lib/redis-cache-manager';
import { googleAdsRateLimiter } from '@/lib/redis-rate-limiter';
import { cookies } from 'next/headers';

interface PredictoCostRevenueResponse {
  google_ads_data: any;
  predicto_data: any;
  cost_revenue_mapping: PredictoCostRevenueMapping[];
  campaign_aggregated: PredictoCostRevenueMapping[];
  summary: PredictoCostRevenueSummary;
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
    const isAdmin = authType === 'admin';

    // For regular users (not admins), enforce account-level access control
    if (authType === 'user' && userAccountId) {
      const normalizedUserAccountId = userAccountId.startsWith('CID_')
        ? userAccountId
        : `CID_${userAccountId}`;
      const accountValue = normalizedUserAccountId.replace('CID_', '');

      const requestedAccounts =
        accountIds && Array.isArray(accountIds) && accountIds.length > 0
          ? accountIds
          : customerId
          ? [customerId]
          : [];

      const unauthorizedAccess = requestedAccounts.some((accId) => {
        const normalizedRequestedId = accId.startsWith('CID_') ? accId : `CID_${accId}`;
        const requestedValue = accId.toString();
        return normalizedRequestedId !== normalizedUserAccountId && requestedValue !== accountValue;
      });

      if (unauthorizedAccess) {
        console.log(
          `[PREDICTO_COST_REVENUE] Access denied: User ${userAccountId} attempted to access unauthorized accounts`
        );
        return NextResponse.json(
          { error: 'Access denied: You can only view data for your own account' },
          { status: 403 }
        );
      }

      body.customerId = accountValue;
      body.accountIds = undefined;

      console.log(`[PREDICTO_COST_REVENUE] User ${userAccountId} accessing their own account data`);
    }

    const isMultiAccount = accountIds && Array.isArray(accountIds) && accountIds.length > 0;

    console.log(
      `[PREDICTO_COST_REVENUE] ${forceRefresh ? 'Force refresh requested - skipping Redis cache' : 'Checking Redis cache'}...`
    );

    // ==================== REDIS AGGREGATED CACHE ====================
    const aggregatedCacheKey = `predicto-agg:${isMultiAccount ? accountIds?.join(',') : customerId || 'all'}:${startDate}:${endDate}`;

    if (!forceRefresh) {
      const cachedAggregated = await redisCacheManager.get(aggregatedCacheKey, {
        dataType: 'predicto',
      });

      if (cachedAggregated.data) {
        console.log(
          `[PREDICTO_COST_REVENUE] Serving cached aggregated data (${Math.round(cachedAggregated.age / 1000)}s old)`
        );

        // For cached data, we can't dynamically detect channels (no Google Ads data yet)
        // So for single account views, we show all data and rely on customer_id filtering below
        let filteredData = cachedAggregated.data.campaign_aggregated;

        console.log(`[PREDICTO_COST_REVENUE] Using cached data - channel filtering will be applied by customer_id`);


        // CRITICAL: For individual account views, filter out orphaned channels from cache
        // This ensures users only see their own account's revenue
        if (!isMultiAccount) {
          const beforeFilter = filteredData.length;
          // Smart filter: Always keep items with cost data, only filter out revenue-only items without customer_id
          filteredData = filteredData.filter((item: any) => {
            // Always keep if has cost data (it's from this account's campaigns)
            if (item.has_cost_data) return true;

            // For revenue-only items, only keep if it has valid customer_id
            return item.customer_id && item.customer_id !== 'unknown';
          });
          const afterFilter = filteredData.length;

          console.log(`[PREDICTO_COST_REVENUE] Single account cache: Filtered out ${beforeFilter - afterFilter} orphaned channels`);
          console.log(`[PREDICTO_COST_REVENUE] Showing ${afterFilter} items: ${filteredData.filter((i: any) => i.has_cost_data).length} with cost, ${filteredData.filter((i: any) => i.has_revenue_data).length} with revenue`);
        }

        // Recalculate summary and account summaries for filtered data
        const filteredSummary = calculateSummary(filteredData);

        // Import aggregateByAccount for cached data
        const { aggregateByAccount } = await import('@/lib/predicto-cost-revenue');
        const filteredAccountSummaries = aggregateByAccount(filteredData);

        return NextResponse.json({
          campaign_aggregated: filteredData,
          summary: filteredSummary,
          account_summaries: filteredAccountSummaries,
          google_ads_data: cachedAggregated.data.google_ads_data || {},
          predicto_data: cachedAggregated.data.predicto_data || {},
          cost_revenue_mapping: [],
          _source: 'redis-aggregated-cache',
          _timestamp: new Date().toISOString(),
          _message: `Cached aggregated data (${Math.round(cachedAggregated.age / 1000)}s old)${!isMultiAccount ? ' - single account view' : ''}`,
          _dataFreshness: {
            source: 'redis',
            ageMinutes: Math.round(cachedAggregated.age / 60000),
            isFresh: cachedAggregated.age < 1800000, // < 30 min
            message: `Aggregated cache (${Math.round(cachedAggregated.age / 60000)} min old)`,
          },
        });
      }
    }

    console.log('[PREDICTO_COST_REVENUE] No aggregated cache, fetching from API...');

    const accountsToProcess = isMultiAccount ? accountIds : customerId ? [customerId] : [];

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const daysDiff = Math.ceil(
      (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(
      `[PREDICTO_COST_REVENUE] Mapping request: ${startDate} to ${endDate} (${daysDiff} days), Accounts: ${isMultiAccount ? accountIds.join(', ') : customerId || 'all'}, forceRefresh: ${forceRefresh}`
    );

    if (daysDiff > 30) {
      console.warn(
        `[PREDICTO_COST_REVENUE] Large date range detected: ${daysDiff} days. This may take longer to load.`
      );
    }

    let message = '';

    try {
      // Check quota status
      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();
      console.log(
        `[PREDICTO_COST_REVENUE] Quota status: ${quotaStatus.dailyUsed}/${quotaStatus.dailyLimit} daily, ${quotaStatus.hourlyUsed}/${quotaStatus.hourlyLimit} hourly`
      );

      let actualForceRefresh = forceRefresh;
      if (quotaStatus.usagePercentage > 90) {
        console.warn(
          `[PREDICTO_COST_REVENUE] Quota usage at ${quotaStatus.usagePercentage}% - BLOCKING forceRefresh to protect quota`
        );
        actualForceRefresh = false;
      }

      const quotaCheck = await googleAdsRateLimiter.canMakeRequest();
      if (actualForceRefresh && !quotaCheck.allowed) {
        console.warn(
          `[PREDICTO_COST_REVENUE] COOLDOWN ACTIVE - Ignoring forceRefresh to serve cached data`
        );
        console.warn(`[PREDICTO_COST_REVENUE] Reason: ${quotaCheck.reason}`);
        actualForceRefresh = false;
      }

      // Clear cache if forceRefresh
      if (actualForceRefresh) {
        console.log(`[PREDICTO_COST_REVENUE] FORCE REFRESH DETECTED - Clearing ALL Predicto caches...`);

        for (const accId of accountsToProcess) {
          console.log(
            `[PREDICTO_COST_REVENUE] Clearing cache for account ${accId} to ensure fresh data...`
          );
          try {
            const { redisClient } = await import('@/lib/redis-client');
            const cacheKey = `cache:google-ads:${accId}:${startDate}:${endDate}:predicto`;
            await redisClient.del(cacheKey);
            console.log(`[PREDICTO_COST_REVENUE] ✓ Cleared cache key: ${cacheKey}`);

            const aggCacheKey = `predicto-agg:${accId}:${startDate}:${endDate}`;
            await redisClient.del(aggCacheKey);
            console.log(`[PREDICTO_COST_REVENUE] ✓ Cleared aggregated cache: ${aggCacheKey}`);
          } catch (cacheError) {
            console.warn(`[PREDICTO_COST_REVENUE] Failed to clear cache:`, cacheError);
          }
        }

        // Clear combined aggregated cache
        try {
          const { redisClient } = await import('@/lib/redis-client');
          const combinedAggCacheKey = `predicto-agg:${isMultiAccount ? accountIds?.join(',') : customerId || 'all'}:${startDate}:${endDate}`;
          await redisClient.del(combinedAggCacheKey);
          console.log(`[PREDICTO_COST_REVENUE] ✓ Cleared combined aggregated cache: ${combinedAggCacheKey}`);
        } catch (cacheError) {
          console.warn(`[PREDICTO_COST_REVENUE] Failed to clear combined aggregated cache:`, cacheError);
        }
      }

      // Fetch Google Ads data
      console.log('[PREDICTO_COST_REVENUE] Fetching Google Ads campaign data...');
      const fetchStartTime = Date.now();

      let googleAdsDataPromises;

      if (isMultiAccount) {
        const BATCH_SIZE = 5;
        console.log(
          `[PREDICTO_COST_REVENUE] Fetching data for ${accountIds.length} accounts in batches of ${BATCH_SIZE}...`
        );

        const allowStaleForMulti = true;
        const maxWaitTime = daysDiff > 14 ? 30000 : daysDiff > 7 ? 20000 : 10000;

        const allAccountsData: any[] = [];
        for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
          const batch = accountIds.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(accountIds.length / BATCH_SIZE);

          console.log(
            `[PREDICTO_COST_REVENUE] 🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} accounts)...`
          );

          const batchResults = await Promise.all(
            batch.map((accId, index) => {
              const globalIndex = i + index + 1;
              console.log(
                `[PREDICTO_COST_REVENUE] Starting fetch ${globalIndex}/${accountIds.length}: Account ${accId}`
              );
              return bulletproofAPI.getData(startDate, endDate, accId, {
                priority: 8,
                allowStale: allowStaleForMulti,
                maxWait: maxWaitTime,
                feedType: 'predicto',
              });
            })
          );

          allAccountsData.push(...batchResults);

          const batchTime = Date.now() - fetchStartTime;
          console.log(
            `[PREDICTO_COST_REVENUE] ✓ Batch ${batchNum}/${totalBatches} completed in ${(batchTime / 1000).toFixed(1)}s`
          );
        }

        googleAdsDataPromises = Promise.resolve(allAccountsData);
      } else {
        const allowStaleSingle = !actualForceRefresh || quotaStatus.usagePercentage > 75;
        const maxWaitTime = daysDiff > 14 ? 30000 : daysDiff > 7 ? 20000 : 10000;

        googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
          priority: 8,
          allowStale: allowStaleSingle,
          maxWait: maxWaitTime,
          feedType: 'predicto',
        });
      }

      // Fetch Google Ads and Predicto data in parallel
      const [googleAdsDataRaw] = await Promise.all([googleAdsDataPromises]);

      const fetchTime = Date.now() - fetchStartTime;
      console.log(`[PREDICTO_COST_REVENUE] ✓ Data fetching completed in ${(fetchTime / 1000).toFixed(1)}s`);

      // Process Google Ads data
      const googleAdsData = isMultiAccount
        ? Array.isArray(googleAdsDataRaw)
          ? googleAdsDataRaw
          : [googleAdsDataRaw]
        : [googleAdsDataRaw];

      console.log(`[PREDICTO_COST_REVENUE] Processing ${googleAdsData.length} Google Ads accounts...`);

      // Debug: Check what's in the response
      googleAdsData.forEach((accountData, index) => {
        // bulletproofAPI wraps data in accountData.data
        const actualData = accountData?.data || accountData;

        const campaignCount = actualData?.campaigns?.length || 0;
        const adCount = actualData?.ads?.length || 0;
        const totalCost = actualData?.campaigns?.reduce((sum: number, c: any) => sum + (c.cost || 0), 0) || 0;
        console.log(`[PREDICTO_COST_REVENUE] 📦 Account ${index + 1}: ${campaignCount} campaigns, ${adCount} ads, total cost: $${totalCost.toFixed(2)}`);
      });

      // Extract campaign data from Google Ads response
      const allCampaigns: any[] = [];
      const campaignFinalUrlsMap = new Map<string, Set<string>>();

      // First, extract final_urls from ads and map them to campaigns
      googleAdsData.forEach((accountData) => {
        // bulletproofAPI wraps data in accountData.data
        const actualData = accountData?.data || accountData;

        if (actualData?.ads && Array.isArray(actualData.ads)) {
          actualData.ads.forEach((ad: any) => {
            const campaignId = ad.campaign_id || ad.id;
            if (ad.final_urls && Array.isArray(ad.final_urls) && ad.final_urls.length > 0) {
              if (!campaignFinalUrlsMap.has(campaignId)) {
                campaignFinalUrlsMap.set(campaignId, new Set());
              }
              ad.final_urls.forEach((url: string) => {
                campaignFinalUrlsMap.get(campaignId)!.add(url);
              });
            }
          });
        }
      });

      console.log(`[PREDICTO_COST_REVENUE] 📎 Extracted final URLs for ${campaignFinalUrlsMap.size} campaigns from ads`);

      // Then, extract campaigns and enrich with final_urls
      googleAdsData.forEach((accountData) => {
        // bulletproofAPI wraps data in accountData.data
        const actualData = accountData?.data || accountData;

        if (actualData?.campaigns && Array.isArray(actualData.campaigns)) {
          actualData.campaigns.forEach((campaign: any) => {
            const campaignId = campaign.campaign_id || campaign.id;
            const finalUrls = campaignFinalUrlsMap.has(campaignId)
              ? Array.from(campaignFinalUrlsMap.get(campaignId)!)
              : [];

            // CRITICAL FIX: Cost data is nested inside campaign.metrics
            const cost = campaign.metrics?.cost || campaign.cost || 0;
            const clicks = campaign.metrics?.clicks || campaign.clicks || 0;
            const impressions = campaign.metrics?.impressions || campaign.impressions || 0;
            const conversions = campaign.metrics?.conversions || campaign.conversions || 0;

            allCampaigns.push({
              customer_id: campaign.customer_id, // Include account ID for account-level aggregation
              campaign_id: campaignId,
              campaign_name: campaign.campaign_name || campaign.name,
              final_urls: finalUrls,
              cost,
              clicks,
              impressions,
              conversions,
            });
          });
        }
      });

      console.log(`[PREDICTO_COST_REVENUE] Extracted ${allCampaigns.length} campaigns from Google Ads data`);

      // Debug: Check cost data
      const totalExtractedCost = allCampaigns.reduce((sum, c) => sum + (c.cost || 0), 0);
      const campaignsWithCost = allCampaigns.filter(c => c.cost > 0).length;
      console.log(`[PREDICTO_COST_REVENUE] 💰 Cost data: ${campaignsWithCost}/${allCampaigns.length} campaigns have cost, total: $${totalExtractedCost.toFixed(2)}`);

      // Debug: Check if campaigns have final_urls
      const campaignsWithUrls = allCampaigns.filter(c => c.final_urls && c.final_urls.length > 0);
      console.log(`[PREDICTO_COST_REVENUE] 📊 Campaigns with Final URLs: ${campaignsWithUrls.length}/${allCampaigns.length}`);

      // DYNAMIC CHANNEL DETECTION: Extract channel IDs from this account's campaigns
      const { extractChannelIdsFromUrl } = await import('@/lib/predicto-channel-mapper');
      const accountChannelIds = new Set<string>();

      if (campaignsWithUrls.length > 0) {
        // Sample first URL to show format
        const sampleUrl = campaignsWithUrls[0].final_urls[0];
        console.log(`[PREDICTO_COST_REVENUE] 📎 Sample Final URL: ${sampleUrl}`);

        // Extract channel IDs from all campaigns
        allCampaigns.forEach(campaign => {
          if (campaign.final_urls && campaign.final_urls.length > 0) {
            campaign.final_urls.forEach((url: string) => {
              const channelIds = extractChannelIdsFromUrl(url);
              channelIds.forEach(id => accountChannelIds.add(id));
            });
          }
        });

        console.log(`[PREDICTO_COST_REVENUE] 🎯 DYNAMIC DETECTION: Found ${accountChannelIds.size} channel IDs from account's campaigns: ${Array.from(accountChannelIds).join(', ')}`);
      } else {
        console.warn(`[PREDICTO_COST_REVENUE] ⚠️  WARNING: No campaigns have Final URLs! Channel mapping will not work.`);
        console.warn(`[PREDICTO_COST_REVENUE] ⚠️  Make sure your Google Ads campaigns have Final URLs with cid parameter (e.g., ?cid=ch88087)`);
      }


      // Fetch Predicto revenue data
      const mappingStartTime = Date.now();
      console.log(`[PREDICTO_COST_REVENUE] Fetching Predicto revenue with custom_channel_id...`);

      const predictoRevenue = await predictoApiClient.fetchRevenueData({
        start_date: startDate,
        end_date: endDate,
        metrics: ['impressions', 'clicks', 'revenue'],
        dimensions: ['custom_channel_id', 'date'],
      });

      console.log(`[PREDICTO_COST_REVENUE] Retrieved ${predictoRevenue.length} Predicto revenue records`);

      // Debug: Log Predicto channel IDs
      const predictoChannelIds = new Set<string>();
      predictoRevenue.forEach(record => {
        if (record.custom_channel_id) {
          predictoChannelIds.add(record.custom_channel_id);
        }
      });
      console.log(`[PREDICTO_COST_REVENUE] 🔖 Predicto has ${predictoChannelIds.size} unique channel IDs: ${Array.from(predictoChannelIds).slice(0, 10).join(', ')}${predictoChannelIds.size > 10 ? '...' : ''}`);

      // Ensure revenue is always a number (not undefined)
      const normalizedPredictoRevenue = predictoRevenue.map(record => ({
        ...record,
        revenue: record.revenue || 0,
      }));

      // Map Google Ads cost with Predicto revenue using channel IDs
      console.log(`[PREDICTO_COST_REVENUE] Using channel-based mapping...`);

      // Import the new channel-based mapping function
      const { mapCostRevenueByChannelId, aggregateByAccount } = await import('@/lib/predicto-cost-revenue');

      let combined = mapCostRevenueByChannelId(allCampaigns, normalizedPredictoRevenue);

      console.log(`[PREDICTO_COST_REVENUE] Combined ${combined.length} campaigns/channels before filtering`);

      // Debug: Check cost in combined data
      const totalCombinedCost = combined.reduce((sum, c) => sum + (c.cost || 0), 0);
      const combinedWithCost = combined.filter(c => c.cost > 0).length;
      console.log(`[PREDICTO_COST_REVENUE] 💰 Combined cost: ${combinedWithCost}/${combined.length} items have cost, total: $${totalCombinedCost.toFixed(2)}`);

      // Debug: Log matching stats
      const withCostAndRevenue = combined.filter(c => c.has_cost_data && c.has_revenue_data).length;
      const costOnly = combined.filter(c => c.has_cost_data && !c.has_revenue_data).length;
      const revenueOnly = combined.filter(c => !c.has_cost_data && c.has_revenue_data).length;
      console.log(`[PREDICTO_COST_REVENUE] 📊 Matching: ${withCostAndRevenue} with both, ${costOnly} cost-only, ${revenueOnly} revenue-only`);

      // DYNAMIC CHANNEL FILTERING: Filter by channels found in account's campaigns
      // For single account views, only show revenue from channels that belong to this account
      if (!isMultiAccount && accountChannelIds.size > 0) {
        console.log(
          `[PREDICTO_COST_REVENUE] 🎯 Single account: Filtering revenue to ${accountChannelIds.size} channels found in campaigns`
        );

        const beforeFilter = combined.length;

        // Filter to only include items where channel_ids overlap with account's channels
        combined = combined.filter(item => {
          // If item has channel_ids array, check for overlap
          if (item.channel_ids && Array.isArray(item.channel_ids)) {
            return item.channel_ids.some(channelId => accountChannelIds.has(channelId));
          }
          // If no channel_ids but has cost data, keep it (it's from this account's campaigns)
          if (item.has_cost_data) {
            return true;
          }
          return false;
        });

        console.log(
          `[PREDICTO_COST_REVENUE] 🎯 Dynamic filtering: ${beforeFilter} → ${combined.length} items (showing only account's channels)`
        );
      } else if (isMultiAccount) {
        console.log('[PREDICTO_COST_REVENUE] Multi-account view - showing all channels');
      } else {
        console.log('[PREDICTO_COST_REVENUE] No channels detected - showing all data');
      }

      // CRITICAL: For individual account views, filter out orphaned channels
      // Orphaned channels are revenue-only items without customer_id (from other accounts)
      // This ensures users only see their own account's revenue
      if (!isMultiAccount) {
        const beforeFilter = combined.length;
        // Smart filter: Keep items that:
        // 1. Have cost data (from this account's campaigns) - always keep
        // 2. Have revenue data AND valid customer_id (matched revenue)
        // Remove: Pure revenue-only items without customer_id (orphaned channels from other accounts)
        combined = combined.filter(item => {
          // Always keep if has cost data (it's from this account's campaigns)
          if (item.has_cost_data) return true;

          // For revenue-only items, only keep if it has valid customer_id
          // This filters out orphaned channels from other accounts
          return item.customer_id && item.customer_id !== 'unknown';
        });
        const afterFilter = combined.length;

        console.log(`[PREDICTO_COST_REVENUE] Single account view: Filtered out ${beforeFilter - afterFilter} orphaned channels (revenue from other accounts)`);
        console.log(`[PREDICTO_COST_REVENUE] Showing ${afterFilter} items: ${combined.filter(i => i.has_cost_data).length} with cost, ${combined.filter(i => i.has_revenue_data).length} with revenue`);
      } else {
        console.log(`[PREDICTO_COST_REVENUE] Multi-account view: Showing all ${combined.length} items including orphaned channels`);
      }

      const summary = calculateSummary(combined);

      // Aggregate by account for account-level breakdown
      const accountSummaries = aggregateByAccount(combined);
      console.log(`[PREDICTO_COST_REVENUE] Generated account summaries for ${accountSummaries.length} accounts`);

      const mappingTime = Date.now() - mappingStartTime;

      console.log(
        `[PREDICTO_COST_REVENUE] ✓ Cost-revenue mapping completed in ${(mappingTime / 1000).toFixed(1)}s`
      );
      console.log(`[PREDICTO_COST_REVENUE] Matched ${combined.length} campaigns`);
      console.log(
        `[PREDICTO_COST_REVENUE] Summary: $${summary.total_cost.toFixed(2)} cost, $${summary.total_revenue.toFixed(2)} revenue, ${summary.average_roi.toFixed(1)}% ROI`
      );

      const totalTime = Date.now() - startTime;

      // Cache the aggregated results
      const cacheData = {
        campaign_aggregated: combined,
        summary: summary,
        account_summaries: accountSummaries,
        google_ads_data: { account_count: googleAdsData.length, campaign_count: allCampaigns.length },
        predicto_data: { record_count: predictoRevenue.length },
      };

      await redisCacheManager.set(aggregatedCacheKey, cacheData, 1800, {
        dataType: 'predicto',
      });
      console.log(`[PREDICTO_COST_REVENUE] ✓ Cached aggregated results with 30min TTL`);

      message = `Successfully mapped Predicto cost-revenue data in ${(totalTime / 1000).toFixed(1)}s${!isMultiAccount ? ' - single account view' : ' - multi-account view'}`;

      return NextResponse.json(
        {
          campaign_aggregated: combined,
          summary: summary,
          account_summaries: accountSummaries,
          google_ads_data: { account_count: googleAdsData.length, campaign_count: allCampaigns.length },
          predicto_data: { record_count: predictoRevenue.length },
          cost_revenue_mapping: [], // Not including full mappings to reduce response size
          _source: 'fresh-api',
          _timestamp: new Date().toISOString(),
          _message: message,
          _dataFreshness: {
            source: 'api',
            ageMinutes: 0,
            isFresh: true,
            message: 'Fresh data from APIs',
          },
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=900',
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (error: any) {
      console.error('[PREDICTO_COST_REVENUE] Error during mapping:', error);
      throw error;
    }
  } catch (error: any) {
    console.error('[PREDICTO_COST_REVENUE] Error processing request:', error);

    const statusCode = error.message?.includes('Invalid') || error.message?.includes('Missing') ? 400 : 500;

    return NextResponse.json(
      {
        error: 'Failed to process Predicto cost-revenue mapping',
        message: error.message || 'Unknown error',
        _timestamp: new Date().toISOString(),
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * GET /api/predicto-cost-revenue
 * Fetch Predicto cost-revenue mapping using query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const customerId = url.searchParams.get('customerId');
    const forceRefresh = url.searchParams.get('forceRefresh') === 'true';

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate and endDate' },
        { status: 400 }
      );
    }

    // Convert GET to POST request body
    const body = {
      startDate,
      endDate,
      customerId,
      forceRefresh,
    };

    // Reuse POST handler logic
    const postRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    });

    return POST(postRequest);
  } catch (error: any) {
    console.error('[PREDICTO_COST_REVENUE] Error processing GET request:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch Predicto cost-revenue data',
        message: error.message || 'Unknown error',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
