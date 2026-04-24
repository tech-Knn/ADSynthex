/**
 * Inuvo API Endpoint
 * Provides cost vs revenue mapping using CAMP_ID extracted from campaign names.
 * Supports single-account (customerId) and multi-account (accountIds) modes.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchInuvoRealtimeData,
  fetchInuvoDailyData,
  mapCostRevenue,
  getCostRevenueSummary,
  getMockInuvoData
} from '@/lib/inuvo-api';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { cookies } from 'next/headers';

const INUVO_ACCOUNTS = [
  { id: '9532228491', name: 'kaptinklunk - Inuvo - PST' },
  { id: '9375852176', name: 'kaptinklunk - Inuvo - PST 2' },
  { id: '6641065048', name: 'kaptinklunk - Inuvo - PST 3' },
  { id: '7053668495', name: 'kaptinklunk - Inuvo - PST 4' },
  { id: '6463288476', name: 'kaptinklunk - Inuvo - PST 5' },
];

// Versioned cache suffix — bump when accounts are added so old cache is bypassed automatically
const INUVO_CACHE_KEY = `inuvo_v${INUVO_ACCOUNTS.length}`;

interface AccountSummary {
  account_id: string;
  account_name: string;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  roi: number;
  campaign_count: number;
}

interface CostRevenueApiResponse {
  inuvo_data: any;
  google_ads_data: any;
  cost_revenue_mapping: any[];
  summary: any;
  account_summaries?: AccountSummary[];
  _source: string;
  _timestamp: string;
  _message: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    let { startDate, endDate, customerId, accountIds, dataType = 'realtime', useMockData = false, forceRefresh = false } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    // Auth: regular users are locked to their own account
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;
    const userAccountId = cookieStore.get('account_id')?.value;

    const isAdmin = authType === 'admin';
    const isMultiAccount = isAdmin && Array.isArray(accountIds) && accountIds.length > 0;

    if (authType === 'user' && userAccountId) {
      const accountValue = userAccountId.replace('CID_', '');
      if (customerId && customerId !== accountValue) {
        return NextResponse.json(
          { error: 'Access denied: You can only view data for your own account' },
          { status: 403 }
        );
      }
      customerId = accountValue;
      accountIds = undefined;
    }

    const modeLabel = isMultiAccount
      ? `ALL accounts (${accountIds.length})`
      : `account ${customerId}`;
    console.log(`[INUVO_ENDPOINT] Request: ${startDate} to ${endDate}, ${modeLabel}, type: ${dataType}`);

    let inuvoData;
    let googleAdsData;
    let message = '';

    try {
      const { googleAdsRateLimiter } = await import('@/lib/redis-rate-limiter');
      const quotaCheck = await googleAdsRateLimiter.canMakeRequest();

      const canFetchFresh = quotaCheck.allowed;
      if (!canFetchFresh) {
        console.warn(`[INUVO_ENDPOINT] Rate limit cooldown active — will use cached data: ${quotaCheck.reason}`);
      }

      const fetchCustomerId = isMultiAccount ? null : (customerId || null);

      // Force-refresh: clear both memory cache and the specific Redis key
      if (forceRefresh && canFetchFresh) {
        try {
          const { redisCacheManager } = await import('@/lib/redis-cache-manager');
          const { redisClient } = await import('@/lib/redis-client');
          // Clear memory cache for inuvo feed
          await redisCacheManager.invalidate('inuvo');
          // Clear Redis directly using the known versioned key format
          const redisKey = `cache:google-ads:${fetchCustomerId || 'all'}:${startDate}:${endDate}:${INUVO_CACHE_KEY}`;
          await redisClient.del(redisKey);
          console.log(`[INUVO_ENDPOINT] Force-refresh: cleared inuvo cache (${redisKey})`);
        } catch (cacheError) {
          console.warn(`[INUVO_ENDPOINT] Cache clear failed:`, cacheError);
        }
      }

      console.log(`[INUVO_ENDPOINT] Parallel fetch: Google Ads (${modeLabel}) + Inuvo ${dataType}...`);

      const inuvoFetch = (useMockData || !process.env.INUVO_ACCESS_TOKEN)
        ? Promise.resolve({ data: getMockInuvoData(startDate, endDate), isMock: true })
        : (dataType === 'daily'
            ? fetchInuvoDailyData(startDate, endDate).then(d => ({ data: d, isMock: false }))
            : fetchInuvoRealtimeData(startDate, endDate).then(d => ({ data: d, isMock: false }))
          ).catch(err => {
            console.warn('[INUVO_ENDPOINT] Inuvo API failed, falling back to mock:', err);
            return { data: getMockInuvoData(startDate, endDate), isMock: true, fallback: true };
          });

      const [googleAdsResult, inuvoResult] = await Promise.all([
        bulletproofAPI.getData(startDate, endDate, fetchCustomerId, {
          priority: 8,
          allowStale: true,
          maxWait: 20000,
          feedType: 'inuvo',
          cacheKeySuffix: INUVO_CACHE_KEY,   // version key so new accounts auto-bust cache
        }),
        inuvoFetch,
      ]);

      // Stale-zero protection: cache returned 0 campaigns — force fresh fetch
      let finalGoogleAdsResult = googleAdsResult;
      if (
        canFetchFresh &&
        !forceRefresh &&
        googleAdsResult.source === 'cache' &&
        !googleAdsResult.data?.campaigns?.length
      ) {
        console.log(`[INUVO_ENDPOINT] Cache returned 0 campaigns — forcing fresh fetch`);
        try {
          const { redisCacheManager } = await import('@/lib/redis-cache-manager');
          const { redisClient } = await import('@/lib/redis-client');
          await redisCacheManager.invalidate('inuvo');
          await redisClient.del(`cache:google-ads:${fetchCustomerId || 'all'}:${startDate}:${endDate}:${INUVO_CACHE_KEY}`);
        } catch (_) { /* ignore */ }
        finalGoogleAdsResult = await bulletproofAPI.getData(startDate, endDate, fetchCustomerId, {
          priority: 8,
          allowStale: false,
          maxWait: 25000,
          feedType: 'inuvo',
          cacheKeySuffix: INUVO_CACHE_KEY,
        });
      }

      googleAdsData = finalGoogleAdsResult.data;
      message += `Google Ads: ${finalGoogleAdsResult.message}. `;

      const rawInuvo = (inuvoResult as any);
      inuvoData = rawInuvo.data;
      if (rawInuvo.isMock && !useMockData) {
        message += `Inuvo: Fallback to mock data (API error). `;
      } else if (rawInuvo.isMock) {
        message += `Inuvo: Mock data (API key not configured). `;
      } else {
        message += `Inuvo: Fresh ${dataType} data from API. `;
      }

      const allCampaigns = googleAdsData?.campaigns || [];
      console.log(`[INUVO_ENDPOINT] Mapping ${allCampaigns.length} campaigns against ${inuvoData.data?.length || 0} Inuvo records`);

      const costRevenueMapping = mapCostRevenue(allCampaigns, inuvoData.data || []);
      const summary = getCostRevenueSummary(costRevenueMapping);

      // Total Inuvo earnings from API (independent of CAMP_ID matching)
      const inuvoTotalEarnings: number = inuvoData.total_earnings || 0;
      const matchedRevenue: number = summary.totalRevenue;
      const unmatchedRevenue: number = Math.max(0, inuvoTotalEarnings - matchedRevenue);

      if (inuvoTotalEarnings > 0) {
        const matchPct = Math.round((matchedRevenue / inuvoTotalEarnings) * 100);
        console.log(`[INUVO_ENDPOINT] Revenue match: $${matchedRevenue.toFixed(2)} matched / $${inuvoTotalEarnings.toFixed(2)} total Inuvo (${matchPct}%)`);
        if (unmatchedRevenue > 0.01) {
          console.warn(`[INUVO_ENDPOINT] $${unmatchedRevenue.toFixed(2)} Inuvo revenue unmatched — CAMP_IDs not found in campaign names/URLs`);
        }
      }

      // Build per-account summaries for admin multi-account view
      let accountSummaries: AccountSummary[] | undefined;
      if (isMultiAccount) {
        const summaryMap = new Map<string, AccountSummary>();

        // Initialise all requested accounts (so accounts with $0 still appear)
        for (const accId of accountIds) {
          const acc = INUVO_ACCOUNTS.find(a => a.id === accId);
          summaryMap.set(accId, {
            account_id: accId,
            account_name: acc?.name || accId,
            total_cost: 0,
            total_revenue: 0,
            total_profit: 0,
            roi: 0,
            campaign_count: 0,
          });
        }

        // Aggregate cost per account from Google Ads campaigns
        for (const campaign of allCampaigns) {
          const accId = campaign.customer_id;
          if (!accId || !summaryMap.has(accId)) continue;
          const entry = summaryMap.get(accId)!;
          entry.total_cost += campaign.metrics?.cost || 0;
          entry.campaign_count += 1;
        }

        // Aggregate revenue per account via cost_revenue_mapping → campaign → customer_id
        for (const mapping of costRevenueMapping) {
          const campaign = allCampaigns.find((c: any) => c.campaign_name === mapping.campaign_name);
          if (!campaign) continue;
          const accId = campaign.customer_id;
          if (!accId || !summaryMap.has(accId)) continue;
          summaryMap.get(accId)!.total_revenue += mapping.revenue || 0;
        }

        // Compute profit + ROI, then round
        for (const entry of summaryMap.values()) {
          entry.total_profit = entry.total_revenue - entry.total_cost;
          entry.roi = entry.total_cost > 0
            ? ((entry.total_revenue - entry.total_cost) / entry.total_cost) * 100
            : 0;
          entry.total_cost = Math.round(entry.total_cost * 100) / 100;
          entry.total_revenue = Math.round(entry.total_revenue * 100) / 100;
          entry.total_profit = Math.round(entry.total_profit * 100) / 100;
          entry.roi = Math.round(entry.roi * 100) / 100;
        }

        accountSummaries = Array.from(summaryMap.values());
      }

      const response: CostRevenueApiResponse = {
        inuvo_data: inuvoData,
        google_ads_data: {
          campaigns: allCampaigns,
          total_cost: summary.totalCost
        },
        cost_revenue_mapping: costRevenueMapping,
        summary: {
          ...summary,
          inuvoTotalEarnings: Math.round(inuvoTotalEarnings * 100) / 100,
          unmatchedRevenue: Math.round(unmatchedRevenue * 100) / 100,
        },
        ...(accountSummaries ? { account_summaries: accountSummaries } : {}),
        _source: 'inuvo_cost_revenue_api',
        _timestamp: new Date().toISOString(),
        _message: message.trim()
      };

      console.log(`[INUVO_ENDPOINT] Done: ${costRevenueMapping.length} mappings, $${summary.totalCost} cost, $${summary.totalRevenue} matched rev, $${inuvoTotalEarnings.toFixed(2)} total Inuvo rev`);

      return NextResponse.json(response, {
        headers: {
          'X-Data-Source': 'INUVO_GOOGLE_ADS_MAPPING',
          'X-Load-Time': (Date.now() - startTime).toString(),
          'X-Mapping-Count': costRevenueMapping.length.toString(),
          'Cache-Control': 'no-cache, must-revalidate'
        }
      });

    } catch (dataError) {
      console.error('[INUVO_ENDPOINT] Data fetching failed:', dataError);

      const mockInuvoData = getMockInuvoData(startDate, endDate);
      const mockMapping = mapCostRevenue([], mockInuvoData.data);
      const mockSummary = getCostRevenueSummary(mockMapping);

      return NextResponse.json({
        inuvo_data: mockInuvoData,
        google_ads_data: { campaigns: [], total_cost: 0 },
        cost_revenue_mapping: mockMapping,
        summary: mockSummary,
        _source: 'mock_fallback',
        _timestamp: new Date().toISOString(),
        _message: `Data fetch failed, using mock data. Error: ${dataError instanceof Error ? dataError.message : 'Unknown error'}`
      }, {
        status: 202,
        headers: { 'X-Data-Source': 'MOCK_FALLBACK', 'X-Error': 'true' }
      });
    }

  } catch (error) {
    console.error('[INUVO_ENDPOINT] Request processing error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      _loadTime: Date.now() - startTime
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      status: 'healthy',
      service: 'Inuvo Cost/Revenue Mapping API',
      version: '2.0.0',
      features: {
        inuvo_api: !!process.env.INUVO_ACCESS_TOKEN ? 'configured' : 'not_configured',
        google_ads_api: 'bulletproof_protected',
        cost_revenue_mapping: 'enabled',
        camp_id_extraction: 'campaign_name',
        multi_account: 'enabled',
        cache_versioning: INUVO_CACHE_KEY,
      },
      accounts: INUVO_ACCOUNTS,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
