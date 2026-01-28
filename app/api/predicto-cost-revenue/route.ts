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
import type { PredictoCostRevenueMapping, PredictoCostRevenueSummary } from '@/lib/predicto-cost-revenue';

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
    const { startDate, endDate, customerId, accountIds, forceRefresh = false, customChannelIds } = body;

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

    // CRITICAL FIX: Re-assign customerId and accountIds after access control modifications
    // The destructured variables from line 36 don't automatically update when body is modified
    const finalCustomerId = body.customerId || customerId;
    const finalAccountIds = body.accountIds || accountIds;

    // Calculate isMultiAccount AFTER resolving final values
    const isMultiAccount = finalAccountIds && Array.isArray(finalAccountIds) && finalAccountIds.length > 0;

    console.log(
      `[PREDICTO_COST_REVENUE] ${forceRefresh ? 'Force refresh requested - skipping Redis cache' : 'Checking Redis cache'}...`
    );
    console.log(`[PREDICTO_COST_REVENUE] Final params: customerId=${finalCustomerId}, accountIds=${Array.isArray(finalAccountIds) ? finalAccountIds.join(',') : 'none'}, isMultiAccount=${isMultiAccount}`);

    // ==================== REDIS AGGREGATED CACHE ====================
    const aggregatedCacheKey = `predicto-agg:${isMultiAccount && Array.isArray(finalAccountIds) ? finalAccountIds.join(',') : finalCustomerId || 'all'}:${startDate}:${endDate}`;

    if (!forceRefresh) {
      const cachedAggregated = await redisCacheManager.get(aggregatedCacheKey, {
        dataType: 'predicto',
      });

      if (cachedAggregated.data) {
        console.log(
          `[PREDICTO_COST_REVENUE] Serving cached aggregated data (${Math.round(cachedAggregated.age / 1000)}s old)`
        );

        // For cached data, use predefined channel mapping
        let filteredData = cachedAggregated.data.campaign_aggregated;

        console.log(`[PREDICTO_COST_REVENUE] Using cached data - applying predefined channel filtering`);

        // CRITICAL: For individual account views, filter by predefined channels
        if (!isMultiAccount && finalCustomerId) {
          const { getAllowedChannels } = await import('@/lib/account-access-control');
          const normalizedCustomerId = finalCustomerId.toString().startsWith('CID_')
            ? finalCustomerId.toString()
            : `CID_${finalCustomerId}`;

          const predefinedChannels = getAllowedChannels(normalizedCustomerId);

          if (predefinedChannels.length > 0) {
            // Filter by predefined channels
            const accountChannelIds = new Set(predefinedChannels);
            const beforeFilter = filteredData.length;

            filteredData = filteredData.filter((item: any) => {
              // Always keep if has cost data (it's from this account's campaigns)
              if (item.has_cost_data) return true;

              // For revenue-only items, check if channel_ids overlap with allowed channels
              if (item.channel_ids && Array.isArray(item.channel_ids)) {
                return item.channel_ids.some((channelId: string) => accountChannelIds.has(channelId));
              }

              // Fallback: check if item has valid customer_id
              return item.customer_id && item.customer_id !== 'unknown';
            });

            const afterFilter = filteredData.length;
            console.log(`[PREDICTO_COST_REVENUE] 🎯 Cache filtered by predefined channels (${predefinedChannels.join(', ')}): ${beforeFilter} → ${afterFilter} items`);
          } else {
            // Fallback to customer_id filtering if no predefined channels
            const beforeFilter = filteredData.length;
            filteredData = filteredData.filter((item: any) => {
              // Always keep if has cost data (it's from this account's campaigns)
              if (item.has_cost_data) return true;

              // For revenue-only items, only keep if it has valid customer_id
              return item.customer_id && item.customer_id !== 'unknown';
            });
            const afterFilter = filteredData.length;

            console.log(`[PREDICTO_COST_REVENUE] Single account cache: Filtered out ${beforeFilter - afterFilter} orphaned channels`);
          }

          console.log(`[PREDICTO_COST_REVENUE] Showing ${filteredData.length} items: ${filteredData.filter((i: any) => i.has_cost_data).length} with cost, ${filteredData.filter((i: any) => i.has_revenue_data).length} with revenue`);
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

    const accountsToProcess = isMultiAccount ? finalAccountIds : finalCustomerId ? [finalCustomerId] : [];

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time for accurate date comparison

    const daysDiff = Math.ceil(
      (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)
    );

    console.log(
      `[PREDICTO_COST_REVENUE] Mapping request: ${startDate} to ${endDate} (${daysDiff} days), Accounts: ${isMultiAccount && Array.isArray(finalAccountIds) ? finalAccountIds.join(', ') : finalCustomerId || 'all'}, forceRefresh: ${forceRefresh}`
    );

    // CRITICAL: Check for future dates
    if (startDateObj > today) {
      const daysInFuture = Math.ceil((startDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      console.error(`[PREDICTO_COST_REVENUE] ⚠️ WARNING: Start date ${startDate} is ${daysInFuture} days in the FUTURE!`);
      console.error(`[PREDICTO_COST_REVENUE] No data will be available for future dates. Did you mean ${new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}?`);
    }

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

      // Clear cache if forceRefresh (OPTIMIZED: Clear all caches in parallel)
      if (actualForceRefresh) {
        console.log(`[PREDICTO_COST_REVENUE] FORCE REFRESH - Clearing ${accountsToProcess.length} account caches in parallel...`);
        const cacheStartTime = Date.now();

        try {
          const { redisClient } = await import('@/lib/redis-client');

          // Build array of all cache keys to clear
          const cacheKeys: string[] = [];

          for (const accId of accountsToProcess) {
            cacheKeys.push(`cache:google-ads:${accId}:${startDate}:${endDate}:predicto`);
            cacheKeys.push(`predicto-agg:${accId}:${startDate}:${endDate}`);
          }

          // Add combined aggregated cache
          const combinedAggCacheKey = `predicto-agg:${isMultiAccount && Array.isArray(finalAccountIds) ? finalAccountIds.join(',') : finalCustomerId || 'all'}:${startDate}:${endDate}`;
          cacheKeys.push(combinedAggCacheKey);

          // Clear all caches in parallel
          if (cacheKeys.length > 0) {
            await Promise.all(cacheKeys.map(key => redisClient.del(key)));

            const cacheTime = Date.now() - cacheStartTime;
            console.log(`[PREDICTO_COST_REVENUE] ✓ Cleared ${cacheKeys.length} cache keys in ${cacheTime}ms`);
          }
        } catch (cacheError) {
          console.warn(`[PREDICTO_COST_REVENUE] Failed to clear caches:`, cacheError);
        }
      }

      // Fetch Google Ads data
      console.log('[PREDICTO_COST_REVENUE] Fetching Google Ads campaign data...');
      const fetchStartTime = Date.now();

      let googleAdsDataPromises;

      if (isMultiAccount && Array.isArray(finalAccountIds)) {
        // CRITICAL: Respect forceRefresh for multi-account views
        const allowStaleForMulti = !actualForceRefresh;
        const maxWaitTime = daysDiff > 14 ? 30000 : daysDiff > 7 ? 20000 : 10000;

        console.log(
          `[PREDICTO_COST_REVENUE] Fetching data for ${finalAccountIds.length} accounts (forceRefresh=${actualForceRefresh}, allowStale=${allowStaleForMulti})...`
        );

        // Fetch all accounts in parallel (no batching needed - bulletproofAPI handles it)
        const allAccountsData = await Promise.all(
          finalAccountIds.map((accId: string, index: number) => {
            console.log(
              `[PREDICTO_COST_REVENUE] Starting fetch ${index + 1}/${finalAccountIds.length}: Account ${accId}`
            );
            return bulletproofAPI.getData(startDate, endDate, accId, {
              priority: 8,
              allowStale: allowStaleForMulti,
              maxWait: maxWaitTime,
              feedType: 'predicto',
            });
          })
        );

        const fetchTime = Date.now() - fetchStartTime;
        console.log(
          `[PREDICTO_COST_REVENUE] ✓ All ${finalAccountIds.length} accounts fetched in ${(fetchTime / 1000).toFixed(1)}s`
        );

        googleAdsDataPromises = Promise.resolve(allAccountsData);
      } else {
        const allowStaleSingle = !actualForceRefresh || quotaStatus.usagePercentage > 75;
        const maxWaitTime = daysDiff > 14 ? 30000 : daysDiff > 7 ? 20000 : 10000;

        console.log(`[PREDICTO_COST_REVENUE] Fetching single account data: customerId=${finalCustomerId}`);
        googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, finalCustomerId, {
          priority: 8,
          allowStale: allowStaleSingle,
          maxWait: maxWaitTime,
          feedType: 'predicto',
        });
      }

      // Fetch Google Ads data (NOT in parallel with Predicto - we validate first)
      const googleAdsDataRaw = await googleAdsDataPromises;

      const fetchTime = Date.now() - fetchStartTime;
      console.log(`[PREDICTO] Google Ads data fetched in ${(fetchTime / 1000).toFixed(1)}s`);

      if (!googleAdsDataRaw) {
        console.warn('[PREDICTO] Google Ads API returned no data, trying cache fallback');

        const cachedFallback = await redisCacheManager.get(aggregatedCacheKey, { dataType: 'predicto' });

        if (cachedFallback.data) {
          console.log(`[PREDICTO] Serving cached data as fallback (${Math.round(cachedFallback.age / 1000)}s old)`);

          const { aggregateByAccount } = await import('@/lib/predicto-cost-revenue');
          const cachedAccountSummaries = aggregateByAccount(cachedFallback.data.campaign_aggregated || []);

          return NextResponse.json({
            ...cachedFallback.data,
            account_summaries: cachedAccountSummaries,
            _source: 'cache-fallback',
            _message: 'Google Ads API unavailable, serving cached data',
            _timestamp: new Date().toISOString()
          });
        }

        return NextResponse.json({
          error: 'Google Ads API failed',
          message: 'Failed to fetch cost data and no cached data available',
          _loadTime: `${Date.now() - startTime}ms`
        }, { status: 503 });
      }

      // Process Google Ads data
      const googleAdsData = isMultiAccount
        ? Array.isArray(googleAdsDataRaw)
          ? googleAdsDataRaw
          : [googleAdsDataRaw]
        : [googleAdsDataRaw];

      // CRITICAL: Validate we have actual data
      if (googleAdsData.length === 0) {
        console.error('[PREDICTO_COST_REVENUE] 🚨 CRITICAL: No Google Ads accounts returned data!');
        return NextResponse.json({
          error: 'No Google Ads data',
          message: 'All Google Ads accounts failed to return data',
          _loadTime: `${Date.now() - startTime}ms`
        }, { status: 503 });
      }

      // Check if any account returned null data from bulletproofAPI
      const nullAccounts: string[] = [];
      googleAdsData.forEach((accountData, index) => {
        if (!accountData || accountData.data === null || accountData.data === undefined) {
          const accountId = isMultiAccount ? finalAccountIds[index] : finalCustomerId;
          nullAccounts.push(accountId);
          console.error(`[PREDICTO_COST_REVENUE] 🚨 Account ${accountId} returned null data (source: ${accountData?.source}, message: ${accountData?.message})`);
        }
      });

      if (nullAccounts.length > 0) {
        const failureRate = nullAccounts.length / googleAdsData.length;
        if (failureRate > 0.5) {
          console.error(`[PREDICTO_COST_REVENUE] 🚨 CRITICAL: ${Math.round(failureRate * 100)}% of accounts returned null data!`);
          return NextResponse.json({
            error: 'Too many account failures',
            message: `${nullAccounts.length} out of ${googleAdsData.length} accounts failed to return data`,
            failedAccounts: nullAccounts,
            _loadTime: `${Date.now() - startTime}ms`
          }, { status: 503 });
        }
        console.warn(`[PREDICTO_COST_REVENUE] ⚠️ WARNING: ${nullAccounts.length} accounts have null data: ${nullAccounts.join(', ')}`);
      }

      console.log(`[PREDICTO_COST_REVENUE] Processing ${googleAdsData.length} Google Ads accounts...`);

      // Debug: Check what's in the response
      googleAdsData.forEach((accountData, index) => {
        // bulletproofAPI wraps data in accountData.data
        const actualData = accountData?.data || accountData;

        const campaignCount = actualData?.campaigns?.length || 0;
        const adCount = actualData?.ads?.length || 0;
        const totalCost = actualData?.campaigns?.reduce((sum: number, c: any) => sum + (c.cost || 0), 0) || 0;
        console.log(`[PREDICTO_COST_REVENUE] 📦 Account ${index + 1}: ${campaignCount} campaigns, ${adCount} ads, total cost: $${totalCost.toFixed(2)}`);

        // ENHANCED LOGGING FOR EST-09 (5777354952)
        const accountCustomerId = actualData?.campaigns?.[0]?.customer_id ||
                                   actualData?.ads?.[0]?.customer_id ||
                                   (isMultiAccount ? finalAccountIds[index] : finalCustomerId);

        if (accountCustomerId === '5777354952') {
          console.log(`[EST-09 DEBUG] ===== ENHANCED LOGGING FOR EST-09 =====`);
          console.log(`[EST-09 DEBUG] Campaign count: ${campaignCount}`);
          console.log(`[EST-09 DEBUG] Ad count: ${adCount}`);
          console.log(`[EST-09 DEBUG] Total cost extracted: $${totalCost.toFixed(2)}`);

          // Show first 3 campaigns with details
          if (actualData?.campaigns && actualData.campaigns.length > 0) {
            console.log(`[EST-09 DEBUG] First 3 campaigns:`);
            actualData.campaigns.slice(0, 3).forEach((c: any, i: number) => {
              console.log(`[EST-09 DEBUG]   ${i + 1}. ID: ${c.campaign_id}, Name: ${c.campaign_name || 'N/A'}`);
              console.log(`[EST-09 DEBUG]      Cost: $${(c.metrics?.cost || c.cost || 0).toFixed(2)}, Clicks: ${c.metrics?.clicks || c.clicks || 0}`);
              console.log(`[EST-09 DEBUG]      Status: ${c.campaign_status || c.status || 'UNKNOWN'}`);
            });
          }

          // Check if ads have final_urls
          if (actualData?.ads && actualData.ads.length > 0) {
            const adsWithUrls = actualData.ads.filter((a: any) => a.final_urls && a.final_urls.length > 0);
            console.log(`[EST-09 DEBUG] Ads with final_urls: ${adsWithUrls.length}/${adCount}`);
            if (adsWithUrls.length > 0) {
              console.log(`[EST-09 DEBUG] Sample final_url: ${adsWithUrls[0].final_urls[0]}`);
            }
          }
        }
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

            const extractMetric = (campaign: any, metricName: string): number => {
              if (campaign.metrics?.[metricName] !== undefined) {
                return Number(campaign.metrics[metricName]) || 0;
              }
              if (campaign[metricName] !== undefined) {
                return Number(campaign[metricName]) || 0;
              }
              if (metricName === 'cost' && campaign.metrics?.cost_micros) {
                return campaign.metrics.cost_micros / 1_000_000;
              }
              if (metricName === 'cost' && campaign.cost_micros) {
                return campaign.cost_micros / 1_000_000;
              }
              return 0;
            };

            const cost = extractMetric(campaign, 'cost');
            const clicks = extractMetric(campaign, 'clicks');
            const impressions = extractMetric(campaign, 'impressions');
            const conversions = extractMetric(campaign, 'conversions');

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

      // CHANNEL ACCESS CONTROL: Use predefined channel mapping from account-access-control.ts
      const { getAllowedChannels } = await import('@/lib/account-access-control');
      const { extractChannelIdsFromUrl } = await import('@/lib/predicto-channel-mapper');

      let accountChannelIds = new Set<string>();

      // PRIORITY 1: Use manually provided channel IDs if given by user
      if (customChannelIds && Array.isArray(customChannelIds) && customChannelIds.length > 0) {
        customChannelIds.forEach((ch: string) => accountChannelIds.add(ch));
        console.log(`[PREDICTO_COST_REVENUE] MANUAL CHANNELS: User specified ${accountChannelIds.size} channel IDs: ${customChannelIds.join(', ')}`);
      }
      // PRIORITY 2: For single account views, use predefined channel access mapping
      else if (!isMultiAccount && finalCustomerId) {
        const normalizedCustomerId = finalCustomerId.toString().startsWith('CID_')
          ? finalCustomerId.toString()
          : `CID_${finalCustomerId}`;

        const predefinedChannels = getAllowedChannels(normalizedCustomerId);

        if (predefinedChannels.length > 0) {
          // Use predefined channel mapping (source of truth)
          predefinedChannels.forEach(ch => accountChannelIds.add(ch));
          console.log(`[PREDICTO_COST_REVENUE] PREDEFINED CHANNELS: Account ${finalCustomerId} has ${accountChannelIds.size} predefined channels: ${Array.from(accountChannelIds).join(', ')}`);
        } else {
          // Fallback to dynamic detection only if no predefined channels exist
          console.log(`[PREDICTO_COST_REVENUE] ℹ️  No predefined channels for account ${finalCustomerId}, using dynamic detection as fallback`);

          // ENHANCED LOGGING FOR EST-09
          if (finalCustomerId === '5777354952') {
            console.log(`[EST-09 DEBUG] ===== CHANNEL DETECTION FOR EST-09 =====`);
            console.log(`[EST-09 DEBUG] Total campaigns: ${allCampaigns.length}`);
            console.log(`[EST-09 DEBUG] Campaigns with URLs: ${campaignsWithUrls.length}`);
          }

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

                  // ENHANCED LOGGING FOR EST-09
                  if (finalCustomerId === '5777354952' && channelIds.length > 0) {
                    console.log(`[EST-09 DEBUG] Found channels in URL: ${channelIds.join(', ')} from ${url}`);
                  }
                });
              }
            });

            console.log(`[PREDICTO_COST_REVENUE] 🔍 DYNAMIC DETECTION: Found ${accountChannelIds.size} channel IDs from campaigns: ${Array.from(accountChannelIds).join(', ')}`);

            // ENHANCED LOGGING FOR EST-09
            if (finalCustomerId === '5777354952') {
              console.log(`[EST-09 DEBUG] Dynamically detected channels: ${Array.from(accountChannelIds).join(', ') || 'NONE'}`);
            }
          } else {
            console.warn(`[PREDICTO_COST_REVENUE]  WARNING: No campaigns have Final URLs! Channel mapping will not work.`);
            console.warn(`[PREDICTO_COST_REVENUE]  Make sure your Google Ads campaigns have Final URLs with cid parameter (e.g., ?cid=ch88087)`);

            // ENHANCED LOGGING FOR EST-09
            if (finalCustomerId === '5777354952') {
              console.error(`[EST-09 DEBUG] ❌ CRITICAL: EST-09 has NO campaigns with final URLs!`);
              console.error(`[EST-09 DEBUG] This means cost data cannot be mapped to channels`);
              console.error(`[EST-09 DEBUG] Add final URLs with ?cid=chXXXXX to EST-09's Google Ads campaigns`);
            }
          }
        }
      } else {
        // For multi-account views, collect all channels from all accounts
        console.log(`[PREDICTO_COST_REVENUE] Multi-account view: Using dynamic channel detection for all accounts`);

        if (campaignsWithUrls.length > 0) {
          allCampaigns.forEach(campaign => {
            if (campaign.final_urls && campaign.final_urls.length > 0) {
              campaign.final_urls.forEach((url: string) => {
                const channelIds = extractChannelIdsFromUrl(url);
                channelIds.forEach(id => accountChannelIds.add(id));
              });
            }
          });
          console.log(`[PREDICTO_COST_REVENUE] 🔍 DYNAMIC DETECTION (Multi): Found ${accountChannelIds.size} channel IDs`);
        }
      }


      const mappingStartTime = Date.now();
      console.log(`[PREDICTO] Fetching Predicto revenue data (all channels)`);

      let predictoRevenue;
      try {
        predictoRevenue = await predictoApiClient.fetchRevenueData({
          start_date: startDate,
          end_date: endDate,
          metrics: ['impressions', 'clicks', 'revenue'],
          dimensions: ['custom_channel_id', 'date']
        });

        console.log(`[PREDICTO] Retrieved ${predictoRevenue.length} Predicto revenue records`);

        // CRITICAL: Validate Predicto returned actual revenue data
        if (!predictoRevenue || !Array.isArray(predictoRevenue)) {
          console.error('[PREDICTO_COST_REVENUE]  CRITICAL: Predicto API returned invalid data format!');
          return NextResponse.json({
            error: 'Invalid Predicto data',
            message: 'Predicto API returned invalid data format',
            _loadTime: `${Date.now() - startTime}ms`
          }, { status: 503 });
        }

        if (predictoRevenue.length === 0) {
          console.warn('[PREDICTO_COST_REVENUE] ⚠️ WARNING: Predicto API returned 0 revenue records');
          console.warn('[PREDICTO_COST_REVENUE] Date range:', startDate, 'to', endDate);
          console.warn('[PREDICTO_COST_REVENUE] This could be normal if:');
          console.warn('[PREDICTO_COST_REVENUE]   - This is a weekend/holiday (no traffic)');
          console.warn('[PREDICTO_COST_REVENUE]   - Accounts are new (no historical data)');
          console.warn('[PREDICTO_COST_REVENUE]   - This is a future date');
          console.warn('[PREDICTO_COST_REVENUE] Continuing with cost-only data...');
          // Don't fail - continue with empty revenue (will show cost-only campaigns)
        }

        // Calculate total revenue to check if it's meaningful
        const totalRevenue = predictoRevenue.reduce((sum, r) => sum + (r.revenue || 0), 0);
        if (totalRevenue === 0) {
          console.warn('[PREDICTO_COST_REVENUE] ⚠️ WARNING: Predicto returned records but total revenue is $0');
          console.warn('[PREDICTO_COST_REVENUE] This might indicate data quality issues');
        } else {
          console.log(`[PREDICTO_COST_REVENUE] ✓ Total Predicto revenue: $${totalRevenue.toFixed(2)}`);
        }
      } catch (predictoError) {
        console.error('[PREDICTO_COST_REVENUE] 🚨 CRITICAL: Predicto API request FAILED:', predictoError);
        return NextResponse.json({
          error: 'Predicto API failed',
          message: predictoError instanceof Error ? predictoError.message : 'Failed to fetch revenue data from Predicto API',
          details: predictoError instanceof Error ? predictoError.stack : String(predictoError),
          _loadTime: `${Date.now() - startTime}ms`
        }, { status: 503 });
      }

      // Debug: Log Predicto channel IDs
      const predictoChannelIds = new Set<string>();
      predictoRevenue.forEach(record => {
        if (record.custom_channel_id) {
          predictoChannelIds.add(record.custom_channel_id);
        }
      });
      console.log(`[PREDICTO_COST_REVENUE] 🔖 Predicto has ${predictoChannelIds.size} unique channel IDs: ${Array.from(predictoChannelIds).slice(0, 10).join(', ')}${predictoChannelIds.size > 10 ? '...' : ''}`);

      // DIAGNOSTIC: Check if account's predefined channels exist in Predicto data
      if (!isMultiAccount && accountChannelIds.size > 0) {
        const accountChannelsArray = Array.from(accountChannelIds);
        const matchingChannels = accountChannelsArray.filter(ch => predictoChannelIds.has(ch));
        const missingChannels = accountChannelsArray.filter(ch => !predictoChannelIds.has(ch));

        console.log(`[PREDICTO_COST_REVENUE] 🔍 CHANNEL DIAGNOSTIC for account ${finalCustomerId}:`);
        console.log(`[PREDICTO_COST_REVENUE]    - Account expects: ${accountChannelsArray.join(', ')}`);
        console.log(`[PREDICTO_COST_REVENUE]    - Found in Predicto: ${matchingChannels.length > 0 ? matchingChannels.join(', ') : 'NONE'}`);
        if (missingChannels.length > 0) {
          console.warn(`[PREDICTO_COST_REVENUE]    -  MISSING in Predicto: ${missingChannels.join(', ')}`);
        }

        // Calculate total revenue for account's channels
        const accountRevenue = predictoRevenue
          .filter(r => r.custom_channel_id && accountChannelIds.has(r.custom_channel_id))
          .reduce((sum, r) => sum + (r.revenue || 0), 0);
        console.log(`[PREDICTO_COST_REVENUE]    - Total revenue for account's channels: $${accountRevenue.toFixed(2)}`);
      }

      // Ensure revenue is always a number (not undefined)
      const normalizedPredictoRevenue = predictoRevenue.map(record => ({
        ...record,
        revenue: record.revenue || 0,
      }));

      // Map Google Ads cost with Predicto revenue using channel IDs
      console.log(`[PREDICTO_COST_REVENUE] Using channel-based mapping...`);

      // Import the channel-based mapping and aggregation functions
      const { mapCostRevenueByChannelId, aggregateByAccount, aggregateMappingsByCampaign } = await import('@/lib/predicto-cost-revenue');

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

      // STRICT CHANNEL OWNERSHIP FILTERING: Use ownership config to prevent cross-account leakage
      // For single account views, only show revenue from channels that BELONG to this account
      if (!isMultiAccount && finalCustomerId) {
        console.log(`[PREDICTO_COST_REVENUE] STRICT OWNERSHIP FILTERING for account ${finalCustomerId}`);

        // Import channel ownership configuration
        const { getAccountChannels, validateChannelOwnership } = await import('@/lib/predicto-channel-ownership');

        // Get the official list of channels that belong to this account
        const ownedChannels = getAccountChannels(finalCustomerId);
        const ownedChannelSet = new Set(ownedChannels);

        if (ownedChannels.length === 0) {
          console.warn(`[PREDICTO] No channel ownership configured for account ${finalCustomerId}`);
          console.warn(`[PREDICTO] Using smart filtering to match revenue with cost campaigns`);
          console.warn(`[PREDICTO] For best accuracy, configure ownership in lib/predicto-channel-ownership.ts`);

          const costCampaignChannels = new Set<string>();
          allCampaigns.forEach(c => {
            if (c.cost > 0 && c.final_urls) {
              c.final_urls.forEach((url: string) => {
                extractChannelIdsFromUrl(url).forEach(ch => costCampaignChannels.add(ch.toLowerCase()));
              });
            }
          });

          console.log(`[PREDICTO] Found ${costCampaignChannels.size} channels in cost campaigns: ${Array.from(costCampaignChannels).slice(0, 5).join(', ')}`);

          const beforeFilter = combined.length;

          if (costCampaignChannels.size === 0) {
            console.warn(`[PREDICTO] No channels found in campaign URLs, skipping channel-based filtering`);
            console.warn(`[PREDICTO] Data is already scoped to account ${finalCustomerId} by API`);
            console.warn(`[PREDICTO] For stricter filtering, add 'cid' parameter to Google Ads final URLs`);

            const kept = combined.length;
            console.log(`[PREDICTO] Permissive mode: keeping all ${kept} items (${combined.filter(i => i.has_cost_data).length} with cost, ${combined.filter(i => !i.has_cost_data && i.has_revenue_data).length} with revenue)`);
          } else {
            combined = combined.filter(item => {
              if (item.has_cost_data) return true;

              if (item.channel_ids && Array.isArray(item.channel_ids)) {
                return item.channel_ids.some(ch => costCampaignChannels.has(ch.toLowerCase()));
              }

              return false;
            });

            const kept = combined.length;
            const blocked = beforeFilter - kept;
            console.log(`[PREDICTO] Smart filter: kept ${kept} items (${combined.filter(i => i.has_cost_data).length} with cost, ${combined.filter(i => !i.has_cost_data && i.has_revenue_data).length} matched revenue), blocked ${blocked} unrelated channels`);
          }
        } else {
          console.log(`[PREDICTO_COST_REVENUE]    Account owns ${ownedChannels.length} channels: ${ownedChannels.slice(0, 10).join(', ')}${ownedChannels.length > 10 ? '...' : ''}`);

          // Validate channels found in campaign URLs
          if (accountChannelIds.size > 0) {
          const validation = validateChannelOwnership(finalCustomerId, Array.from(accountChannelIds));

          if (validation.invalid.length > 0) {
            console.warn(`[PREDICTO_COST_REVENUE]     INVALID channels in campaign URLs (don't belong to this account):`);
            console.warn(`[PREDICTO_COST_REVENUE]       ${validation.invalid.join(', ')}`);
            console.warn(`[PREDICTO_COST_REVENUE]       These channels need to be removed/corrected in Google Ads!`);
          }

          if (validation.missing.length > 0) {
            console.warn(`[PREDICTO_COST_REVENUE]    ℹ️  Missing channels (owned but not in URLs):`);
            console.warn(`[PREDICTO_COST_REVENUE]       ${validation.missing.join(', ')}`);
          }

          if (validation.valid.length > 0) {
            console.log(`[PREDICTO_COST_REVENUE]    ✓ Valid channels: ${validation.valid.length} channels correctly configured`);
          }
          }

          const beforeFilter = combined.length;

          combined = combined.filter(item => {
            if (item.has_cost_data) return true;

            if (item.channel_ids && Array.isArray(item.channel_ids) && item.channel_ids.length > 0) {
              return item.channel_ids.some(channelId => ownedChannelSet.has(channelId.toLowerCase()));
            }

            if (item.customer_id && item.customer_id === finalCustomerId) return true;

            return false;
          });

          console.log(
            `[PREDICTO_COST_REVENUE] Strict filtering: ${beforeFilter} → ${combined.length} items (showing only owned channels)`
          );
        }
      } else if (isMultiAccount) {
        console.log('[PREDICTO_COST_REVENUE] Multi-account view - showing all channels');
      } else {
        console.log('[PREDICTO_COST_REVENUE] No channels detected - showing all data');
      }

      // CRITICAL: For individual account views, validate that filtered items match account's channels
      // This is a safety check AFTER channel filtering to ensure data integrity
      if (!isMultiAccount && accountChannelIds.size > 0) {
        const beforeValidation = combined.length;

        // Validate that all items either:
        // 1. Have cost data (from this account's campaigns), OR
        // 2. Have channel_ids that match accountChannelIds (predefined or detected), OR
        // 3. Have valid customer_id matching this account
        combined = combined.filter(item => {
          if (item.has_cost_data) return true;

          if (item.channel_ids && Array.isArray(item.channel_ids)) {
            const hasMatchingChannel = item.channel_ids.some(channelId => accountChannelIds.has(channelId));
            if (hasMatchingChannel) return true;
          }

          if (item.customer_id && item.customer_id === finalCustomerId) return true;

          return false;
        });

        const afterValidation = combined.length;

        if (beforeValidation !== afterValidation) {
          console.log(`[PREDICTO_COST_REVENUE] Data validation: ${beforeValidation} → ${afterValidation} items (removed ${beforeValidation - afterValidation} invalid items)`);
        }
        console.log(`[PREDICTO_COST_REVENUE] Final dataset: ${afterValidation} items (${combined.filter(i => i.has_cost_data).length} with cost, ${combined.filter(i => i.has_revenue_data).length} with revenue)`);
      } else if (isMultiAccount) {
        console.log(`[PREDICTO_COST_REVENUE] Multi-account view: Showing all ${combined.length} items`);
      } else {
        console.log(`[PREDICTO_COST_REVENUE] Single account (no channel restrictions): Showing all ${combined.length} items`);
      }

      // CRITICAL: Aggregate per-day campaign records by campaign_id
      // Without this, campaigns show up multiple times (once per day), doubling/tripling clicks!
      const aggregated = aggregateMappingsByCampaign(combined);
      console.log(`[PREDICTO_COST_REVENUE] Aggregated ${combined.length} daily records → ${aggregated.length} unique campaigns`);

      const summary = calculateSummary(aggregated);

      // Aggregate by account for account-level breakdown
      const accountSummaries = aggregateByAccount(aggregated);
      console.log(`[PREDICTO_COST_REVENUE] Generated account summaries for ${accountSummaries.length} accounts`);

      const mappingTime = Date.now() - mappingStartTime;

      console.log(
        `[PREDICTO_COST_REVENUE] ✓ Cost-revenue mapping completed in ${(mappingTime / 1000).toFixed(1)}s`
      );
      console.log(`[PREDICTO_COST_REVENUE] Matched ${aggregated.length} campaigns`);
      console.log(
        `[PREDICTO_COST_REVENUE] Summary: $${summary.total_cost.toFixed(2)} cost, $${summary.total_revenue.toFixed(2)} revenue, ${summary.average_roi.toFixed(1)}% ROI`
      );

      const totalTime = Date.now() - startTime;

      // CRITICAL: Data quality validation before caching
      const hasCampaigns = allCampaigns.length > 0;
      const hasRevenue = predictoRevenue.length > 0;
      const totalCost = summary.total_cost || 0;
      const totalRevenue = summary.total_revenue || 0;
      const campaignsWithCostFinal = allCampaigns.filter(c => c.cost > 0).length;

      console.log(`[PREDICTO_COST_REVENUE] ===== DATA QUALITY CHECK =====`);
      console.log(`[PREDICTO_COST_REVENUE] Campaigns: ${allCampaigns.length} total, ${campaignsWithCostFinal} with cost`);
      console.log(`[PREDICTO_COST_REVENUE] Revenue records: ${predictoRevenue.length}`);
      console.log(`[PREDICTO_COST_REVENUE] Total cost: $${totalCost.toFixed(2)}`);
      console.log(`[PREDICTO_COST_REVENUE] Total revenue: $${totalRevenue.toFixed(2)}`);

      // WARNING: If we have campaigns with metrics but NO cost data was extracted, the data structure is wrong
      // This is different from having $0 cost (which is valid for new campaigns)
      if (hasCampaigns && campaignsWithCostFinal === 0 && allCampaigns.some(c => c.clicks > 0 || c.impressions > 0)) {
        console.error(`[PREDICTO_COST_REVENUE] 🚨 DATA QUALITY WARNING: ${allCampaigns.length} campaigns with clicks/impressions but $0 cost`);
        console.error(`[PREDICTO_COST_REVENUE] This indicates cost data extraction failed - NOT caching this response!`);

        return NextResponse.json({
          success: false,
          warning: 'Data quality issue detected',
          message: `Found ${allCampaigns.length} campaigns with traffic but cost extraction failed. Data structure may be incorrect.`,
          dataQualityIssues: {
            hasCampaigns,
            hasRevenue,
            campaignCount: allCampaigns.length,
            campaignsWithCost: campaignsWithCostFinal,
            revenueRecords: predictoRevenue.length,
            totalCost,
            totalRevenue
          },
          _loadTime: `${Date.now() - startTime}ms`,
          _notCached: true,
          _recommendation: 'Check if campaign.metrics.cost field structure has changed'
        }, {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Data-Quality': 'degraded'
          }
        });
      }

      // Info: Log if we have cost but no revenue (legitimate scenario)
      if (totalCost > 0 && totalRevenue === 0) {
        console.log(`[PREDICTO_COST_REVENUE] ℹ️  Cost without revenue: This is normal for weekends/holidays or new campaigns`);
      }

      // Cache the aggregated results only if data quality is good
      const cacheData = {
        campaign_aggregated: aggregated,
        summary: summary,
        account_summaries: accountSummaries,
        google_ads_data: { account_count: googleAdsData.length, campaign_count: allCampaigns.length },
        predicto_data: { record_count: predictoRevenue.length },
      };

      await redisCacheManager.set(aggregatedCacheKey, cacheData, 1800, {
        dataType: 'predicto',
      });
      console.log(`[PREDICTO_COST_REVENUE] ✅ Data quality passed - Cached aggregated results with 30min TTL`);

      message = `Successfully mapped Predicto cost-revenue data in ${(totalTime / 1000).toFixed(1)}s${!isMultiAccount ? ' - single account view' : ' - multi-account view'}`;

      return NextResponse.json(
        {
          campaign_aggregated: aggregated,
          summary: summary,
          account_summaries: accountSummaries,
          google_ads_data: { account_count: googleAdsData.length, campaign_count: allCampaigns.length },
          predicto_data: { record_count: predictoRevenue.length },
          cost_revenue_mapping: [], // Not including full mappings to reduce response size
          _source: 'fresh-api',
          _timestamp: new Date().toISOString(),
          _message: message,
          _activeChannels: Array.from(accountChannelIds),
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
