/**
 * Optimized Google Ads API Route
 * Implements all the smart optimizations for better performance and consistency
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGoogleAdsData, getMockGoogleAdsData } from '@/lib/google-ads-api';
import { unifiedCache } from '@/lib/unified-cache-manager';
import { smartBackgroundRefresher } from '@/lib/smart-background-refresher';
import { smartRateLimiter } from '@/lib/smart-rate-limiter';

interface ApiResponse {
  ads: any[];
  campaigns?: any[];
  total_cost?: number;
  _source: 'cache' | 'api' | 'mock';
  _cacheStatus: string;
  _age?: number;
  _stats?: any;
  _message?: string;
}

// Enhanced data transformation to ensure consistency
function transformApiResponse(
  data: any, 
  startDate: string, 
  endDate: string, 
  customerId: string | null
): any {
  if (!data || !data.ads) {
    console.warn('[TRANSFORM] Invalid data structure, returning empty result');
    return { ads: [], campaigns: [], total_cost: 0 };
  }

  let filteredAds = Array.isArray(data.ads) ? data.ads : [];
  
  // Filter by customer ID if specified
  if (customerId && customerId !== 'all') {
    const originalCount = filteredAds.length;
    filteredAds = filteredAds.filter((ad: any) => ad.customer_id === customerId);
    console.log(`[TRANSFORM] Filtered by customer ${customerId}: ${filteredAds.length}/${originalCount} ads`);
  }
  
  // Remove any Taboola data
  const preTaboolaCount = filteredAds.length;
  filteredAds = filteredAds.filter((ad: any) => {
    if (!ad.final_urls || !Array.isArray(ad.final_urls)) return true;
    
    const hasTaboolaUrl = ad.final_urls.some((url: string) => 
      url.toLowerCase().includes('taboola')
    );
    const hasTaboolaName = 
      (ad.campaign_name && ad.campaign_name.toLowerCase().includes('taboola')) ||
      (ad.ad_name && ad.ad_name.toLowerCase().includes('taboola'));
    
    return !hasTaboolaUrl && !hasTaboolaName;
  });
  
  if (preTaboolaCount !== filteredAds.length) {
    console.log(`[TRANSFORM] Removed ${preTaboolaCount - filteredAds.length} Taboola ads`);
  }

  // Calculate total cost with proper validation
  const totalCost = filteredAds.reduce((sum: number, ad: any) => {
    const cost = ad?.metrics?.cost || 0;
    return sum + (typeof cost === 'number' && !isNaN(cost) ? cost : 0);
  }, 0);

  return {
    ads: filteredAds,
    campaigns: data.campaigns || [],
    total_cost: Math.round(totalCost * 100) / 100, // Round to 2 decimal places
    _transformedAt: new Date().toISOString(),
    _adCount: filteredAds.length,
    _originalAdCount: data.ads?.length || 0
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse request body
    const body = await request.json();
    const { startDate, endDate, customerId } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    const isIndividualAccount = customerId && customerId !== 'all';
    console.log(`[OPTIMIZED_API] Request: ${isIndividualAccount ? 'individual' : 'aggregated'} account data for ${startDate} to ${endDate}`);

    // Track user access patterns for smart background refresh
    smartBackgroundRefresher.trackUserAccess(customerId, startDate, endDate);

    // Check unified cache first
    const cacheResult = unifiedCache.getWithFallback(
      startDate,
      endDate,
      customerId,
      isIndividualAccount ? ['individual', 'cost'] : ['aggregated', 'individual', 'cost']
    );

    // Determine refresh strategy
    const refreshStatus = unifiedCache.shouldRefresh(
      startDate,
      endDate,
      customerId,
      isIndividualAccount ? 'individual' : 'aggregated'
    );

    // If we have valid cached data and no immediate refresh needed
    if (cacheResult.data && !refreshStatus.shouldRefresh) {
      const transformedData = transformApiResponse(cacheResult.data, startDate, endDate, customerId);
      
      // Schedule background refresh if needed
      if (refreshStatus.backgroundRefresh) {
        smartBackgroundRefresher.scheduleRefresh(customerId, startDate, endDate, {
          priority: 3,
          delayMs: 30000 // 30 seconds
        });
      }

      const response: ApiResponse = {
        ...transformedData,
        _source: 'cache',
        _cacheStatus: `HIT_${cacheResult.source.toUpperCase()}`,
        _age: Math.round(cacheResult.age / 1000),
        _stats: {
          cache: unifiedCache.getStats(),
          backgroundRefresh: smartBackgroundRefresher.getStats()
        },
        _message: `Served from ${cacheResult.source} cache${cacheResult.isStale ? ' (stale)' : ''}`
      };

      return NextResponse.json(response, {
        headers: {
          'X-Cache': `HIT_${cacheResult.source.toUpperCase()}`,
          'X-Age': Math.round(cacheResult.age / 1000).toString(),
          'X-Processing-Time': (Date.now() - startTime).toString()
        }
      });
    }

    // EMERGENCY: Skip API calls due to rate limit ban
    {
      console.log('[EMERGENCY] Skipping Google Ads API due to rate limit ban - using mock data');

      // Use mock data instead of making API calls
      const mockData = getMockGoogleAdsData(startDate, endDate, customerId);
      const transformedData = transformApiResponse(mockData, startDate, endDate, customerId);
      
      // Store mock data in cache to prevent further API attempts
      unifiedCache.set(
        startDate,
        endDate,
        customerId,
        transformedData,
        {
          dataType: isIndividualAccount ? 'individual' : 'aggregated',
          priority: 1,
          customTTL: 60 * 60 * 1000 // 1 hour TTL for mock data
        }
      );

      const response: ApiResponse = {
        ...transformedData,
        _source: 'mock',
        _cacheStatus: 'MOCK_RATE_LIMITED',
        _message: 'Using mock data due to Google Ads API rate limit'
      };

      return NextResponse.json(response, {
        headers: {
          'X-Cache': 'MOCK_RATE_LIMITED',
          'X-Processing-Time': (Date.now() - startTime).toString()
        }
      });
    }

    /* DISABLED DUE TO RATE LIMIT BAN - API calls commented out
    const freshData = await smartRateLimiter.executeRequest(...);
    // ... rest of API logic commented out for rate limit protection
    */

  } catch (error) {
    console.error('[OPTIMIZED_API] Request processing error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        _processingTime: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET(request: NextRequest) {
  const stats = {
    cache: unifiedCache.getStats(),
    rateLimiter: smartRateLimiter.getStats(),
    backgroundRefresh: smartBackgroundRefresher.getStats(),
    timestamp: new Date().toISOString()
  };

  return NextResponse.json({
    status: 'healthy',
    version: '2.0.0',
    stats
  });
}

