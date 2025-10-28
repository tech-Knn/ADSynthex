/**
 * Inuvo API Endpoint
 * Provides cost vs revenue mapping using TKID
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

interface CostRevenueApiResponse {
  inuvo_data: any;
  google_ads_data: any;
  cost_revenue_mapping: any[];
  summary: any;
  _source: string;
  _timestamp: string;
  _message: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();
    let { startDate, endDate, customerId, dataType = 'realtime', useMockData = false, forceRefresh = false } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    // Authorization: Check if user has access to requested account
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;
    const userAccountId = cookieStore.get('account_id')?.value;

    // For regular users (not admins), enforce account-level access control
    if (authType === 'user' && userAccountId) {
      // Normalize account ID format
      const normalizedUserAccountId = userAccountId.startsWith('CID_') ? userAccountId : `CID_${userAccountId}`;
      const accountValue = normalizedUserAccountId.replace('CID_', '');

      // Check if user is requesting a different account
      if (customerId && customerId !== accountValue) {
        console.log(`[INUVO_ENDPOINT] ⚠️  Access denied: User ${userAccountId} attempted to access account ${customerId}`);
        return NextResponse.json(
          { error: 'Access denied: You can only view data for your own account' },
          { status: 403 }
        );
      }

      // Force the request to use the user's account
      customerId = accountValue;
      console.log(`[INUVO_ENDPOINT] 🔒 User ${userAccountId} accessing their own account data`);
    }

    console.log(`[INUVO_ENDPOINT] Cost/Revenue mapping request: ${startDate} to ${endDate}, type: ${dataType}, forceRefresh: ${forceRefresh}`);

    let inuvoData;
    let googleAdsData;
    let message = '';

    try {
      // COOLDOWN PROTECTION: Check before clearing cache
      const { googleAdsRateLimiter } = await import('@/lib/redis-rate-limiter');
      const quotaCheck = await googleAdsRateLimiter.canMakeRequest();

      let actualForceRefresh = forceRefresh;
      if (forceRefresh && !quotaCheck.allowed) {
        console.warn(`[INUVO_ENDPOINT] 🛡️ COOLDOWN ACTIVE - Ignoring forceRefresh to serve cached data`);
        console.warn(`[INUVO_ENDPOINT] Reason: ${quotaCheck.reason}`);
        actualForceRefresh = false;
      }

      // Clear cache for new Inuvo accounts or if forceRefresh (and not in cooldown)
      const newInuvoAccounts = ['8277852439', '3882415196'];
      const shouldClearCache = actualForceRefresh || (customerId && newInuvoAccounts.includes(customerId));

      if (shouldClearCache && customerId) {
        console.log(`[INUVO_ENDPOINT] ⚡ Clearing cache for account ${customerId} to ensure fresh data...`);
        try {
          const { redisCacheManager } = await import('@/lib/redis-cache-manager');
          const keys = await redisCacheManager.getKeysByPattern(`*${customerId}*`);
          for (const key of keys) {
            await redisCacheManager.delete(key);
          }
          console.log(`[INUVO_ENDPOINT] ✓ Cleared ${keys.length} cache entries for account ${customerId}`);
        } catch (cacheError) {
          console.warn(`[INUVO_ENDPOINT] ⚠️  Failed to clear cache:`, cacheError);
        }
      }

      // Fetch Google Ads cost data using bulletproof API
      console.log('[INUVO_ENDPOINT] Fetching Google Ads cost data (Inuvo accounts only)...');
      const googleAdsResult = await bulletproofAPI.getData(startDate, endDate, customerId, {
        priority: 8,
        allowStale: !actualForceRefresh,
        maxWait: 20000,
        feedType: 'inuvo' // CRITICAL: ONLY fetch Inuvo accounts
      });

      googleAdsData = googleAdsResult.data;
      message += `Google Ads: ${googleAdsResult.message}. `;

      // Fetch Inuvo revenue data
      console.log('[INUVO_ENDPOINT] Fetching Inuvo revenue data...');
1
      if (useMockData || !process.env.INUVO_ACCESS_TOKEN) {
        console.log('[INUVO_ENDPOINT] Using mock Inuvo data');
        inuvoData = getMockInuvoData(startDate, endDate);
        message += 'Inuvo: Mock data (API key not configured). ';
      } else {
        try {
          if (dataType === 'daily') {
            inuvoData = await fetchInuvoDailyData(startDate, endDate, customerId);
          } else {
            inuvoData = await fetchInuvoRealtimeData(startDate, endDate, customerId);
          }
          message += `Inuvo: Fresh ${dataType} data from API. `;
        } catch (inuvoError) {
          console.warn('[INUVO_ENDPOINT] Inuvo API failed, using mock data:', inuvoError);
          inuvoData = getMockInuvoData(startDate, endDate);
          message += 'Inuvo: Fallback to mock data (API error). ';
        }
      }

      // Create cost/revenue mapping using TKID
      console.log('[INUVO_ENDPOINT] Creating cost/revenue mapping...');
      const costRevenueMapping = mapCostRevenue(
        googleAdsData?.ads || [],
        inuvoData.data || []
      );

      // Generate summary
      const summary = getCostRevenueSummary(costRevenueMapping);

      const response: CostRevenueApiResponse = {
        inuvo_data: inuvoData,
        google_ads_data: {
          ads: googleAdsData?.ads || [],
          campaigns: googleAdsData?.campaigns || [],
          total_cost: googleAdsData?.ads?.reduce((sum: number, ad: any) => sum + (ad.metrics?.cost || 0), 0) || 0
        },
        cost_revenue_mapping: costRevenueMapping,
        summary,
        _source: 'inuvo_cost_revenue_api',
        _timestamp: new Date().toISOString(),
        _message: message.trim()
      };

      console.log(`[INUVO_ENDPOINT] Response: ${costRevenueMapping.length} mappings, $${summary.totalCost} cost, $${summary.totalRevenue} revenue`);

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
      
      // Fallback to mock data for both sources
      const mockInuvoData = getMockInuvoData(startDate, endDate);
      const mockGoogleAdsData = {
        ads: [
          {
            ad_id: 'online_tkid1',
            campaign_name: 'Mock Campaign 1',
            metrics: { cost: 85.30 },
            date: startDate
          },
          {
            ad_id: 'online_tkid2', 
            campaign_name: 'Mock Campaign 2',
            metrics: { cost: 67.50 },
            date: startDate
          }
        ],
        campaigns: [],
        total_cost: 152.80
      };

      const mockMapping = mapCostRevenue(mockGoogleAdsData.ads, mockInuvoData.data);
      const mockSummary = getCostRevenueSummary(mockMapping);

      const fallbackResponse: CostRevenueApiResponse = {
        inuvo_data: mockInuvoData,
        google_ads_data: mockGoogleAdsData,
        cost_revenue_mapping: mockMapping,
        summary: mockSummary,
        _source: 'mock_fallback',
        _timestamp: new Date().toISOString(),
        _message: `Data fetch failed, using mock data. Error: ${dataError instanceof Error ? dataError.message : 'Unknown error'}`
      };

      return NextResponse.json(fallbackResponse, {
        status: 202, // Accepted but mock data
        headers: {
          'X-Data-Source': 'MOCK_FALLBACK',
          'X-Load-Time': (Date.now() - startTime).toString(),
          'X-Error': 'true'
        }
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

/**
 * Health check endpoint for Inuvo integration
 */
export async function GET(request: NextRequest) {
  try {
    const hasInuvoToken = !!process.env.INUVO_ACCESS_TOKEN;
    
    return NextResponse.json({
      status: 'healthy',
      service: 'Inuvo Cost/Revenue Mapping API',
      version: '1.0.0',
      features: {
        inuvo_api: hasInuvoToken ? 'configured' : 'not_configured',
        google_ads_api: 'bulletproof_protected',
        cost_revenue_mapping: 'enabled',
        tkid_mapping: 'enabled' 
      },
      accounts: [
        { id: '7195529443', name: 'Inuvo - Account - 02 - GMT' },
        { id: '7616718892', name: 'Inuvo - Account 2 - PST (GMT -8:00)' },
        { id: '9833281050', name: 'Inuvo - Account 3 - PST (GMT -8:00)' },
        { id: '9790364217', name: 'Inuvo - Account - 03 - GMT' },
        { id: '9835231086', name: 'Inuvo - Account - 04 - GMT' },
        { id: '2420687578', name: 'Inuvo - Account - 05 - GMT' },
        { id: '8277852439', name: 'Inuvo - Account 4 - PST (GMT -8:00)' },
        { id: '3882415196', name: 'Inuvo - Account 6 - PST (GMT -8:00)' }
      ],
      endpoints: {
        realtime: '/api/inuvo (POST with dataType: "realtime")',
        daily: '/api/inuvo (POST with dataType: "daily")',
        health: '/api/inuvo (GET)'
      },
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



