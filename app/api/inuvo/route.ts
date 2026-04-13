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
];

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
      // Users cannot use multi-account mode
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

      // Inuvo is a realtime dashboard — never serve stale/zero-cached Google Ads data.
      // Always fetch fresh unless the rate limiter is in cooldown.
      const canFetchFresh = quotaCheck.allowed;
      if (!canFetchFresh) {
        console.warn(`[INUVO_ENDPOINT] Rate limit cooldown active — will try cached data: ${quotaCheck.reason}`);
      }

      // For multi-account, fetch all Inuvo accounts (customerId=null, feedType=inuvo)
      // For single-account, fetch specific account
      const fetchCustomerId = isMultiAccount ? null : (customerId || null);

      // Always clear the Inuvo cache before fetching so we never serve zero-data from a
      // stale cached call that ran before today's spend started.
      if (canFetchFresh) {
        try {
          const { redisCacheManager } = await import('@/lib/redis-cache-manager');
          const pattern = fetchCustomerId ? `*${fetchCustomerId}*` : `*inuvo*`;
          const keys = await redisCacheManager.getKeysByPattern(pattern);
          if (keys.length > 0) {
            for (const key of keys) await redisCacheManager.delete(key);
            console.log(`[INUVO_ENDPOINT] Cleared ${keys.length} stale cache entries`);
          }
        } catch (cacheError) {
          console.warn(`[INUVO_ENDPOINT] Cache clear failed:`, cacheError);
        }
      }

      // Fetch Google Ads cost data — allowStale only when rate-limited
      console.log(`[INUVO_ENDPOINT] Fetching Google Ads data for ${modeLabel}...`);
      const googleAdsResult = await bulletproofAPI.getData(startDate, endDate, fetchCustomerId, {
        priority: 8,
        allowStale: !canFetchFresh,
        maxWait: 20000,
        feedType: 'inuvo'
      });

      googleAdsData = googleAdsResult.data;
      message += `Google Ads: ${googleAdsResult.message}. `;

      // Fetch Inuvo revenue data (single call returns all CAMP_IDs)
      console.log('[INUVO_ENDPOINT] Fetching Inuvo revenue data...');
      if (useMockData || !process.env.INUVO_ACCESS_TOKEN) {
        inuvoData = getMockInuvoData(startDate, endDate);
        message += 'Inuvo: Mock data (API key not configured). ';
      } else {
        try {
          if (dataType === 'daily') {
            inuvoData = await fetchInuvoDailyData(startDate, endDate);
          } else {
            inuvoData = await fetchInuvoRealtimeData(startDate, endDate);
          }
          message += `Inuvo: Fresh ${dataType} data from API. `;
        } catch (inuvoError) {
          console.warn('[INUVO_ENDPOINT] Inuvo API failed, using mock data:', inuvoError);
          inuvoData = getMockInuvoData(startDate, endDate);
          message += 'Inuvo: Fallback to mock data (API error). ';
        }
      }

      // Build cost/revenue mapping using CAMP_ID from campaign names
      const allCampaigns = googleAdsData?.campaigns || [];
      console.log(`[INUVO_ENDPOINT] Mapping ${allCampaigns.length} campaigns against ${inuvoData.data?.length || 0} Inuvo records`);

      const costRevenueMapping = mapCostRevenue(allCampaigns, inuvoData.data || []);
      const summary = getCostRevenueSummary(costRevenueMapping);

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

        // Aggregate per account using customer_id on each campaign
        for (const campaign of allCampaigns) {
          const accId = campaign.customer_id;
          if (!accId || !summaryMap.has(accId)) continue;
          const entry = summaryMap.get(accId)!;
          entry.total_cost += campaign.metrics?.cost || 0;
          entry.campaign_count += 1;
        }

        // Match revenue back to accounts via the cost_revenue_mapping
        for (const mapping of costRevenueMapping) {
          // Find which account this campaign belongs to
          const campaign = allCampaigns.find((c: any) => c.campaign_name === mapping.campaign_name);
          if (!campaign) continue;
          const accId = campaign.customer_id;
          if (!accId || !summaryMap.has(accId)) continue;
          const entry = summaryMap.get(accId)!;
          entry.total_revenue += mapping.revenue || 0;
        }

        // Compute profit + ROI for each account
        for (const entry of summaryMap.values()) {
          entry.total_profit = entry.total_revenue - entry.total_cost;
          entry.roi = entry.total_cost > 0
            ? ((entry.total_revenue - entry.total_cost) / entry.total_cost) * 100
            : 0;
          // Round
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
        summary,
        ...(accountSummaries ? { account_summaries: accountSummaries } : {}),
        _source: 'inuvo_cost_revenue_api',
        _timestamp: new Date().toISOString(),
        _message: message.trim()
      };

      console.log(`[INUVO_ENDPOINT] Done: ${costRevenueMapping.length} mappings, $${summary.totalCost} cost, $${summary.totalRevenue} revenue`);

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
        multi_account: 'enabled'
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
