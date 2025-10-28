/**
 * Production-Ready Google Ads API Endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';

interface ApiResponse {
  ads: any[];
  campaigns?: any[];
  total_cost?: number;
  _source: 'cache' | 'api' | 'stale' | 'fallback';
  _age?: number;
  _message: string;
  _quotaStatus: any;
  _systemHealth: any;
  _loadTime: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse request
    const body = await request.json();
    const { startDate, endDate, customerId } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    console.log(`[PRODUCTION_API] Request: ${startDate} to ${endDate}, customer: ${customerId || 'all'} (Ads.com feed only)`);

    // CRITICAL FIX: Pass feedType to filter only Ads.com accounts
    const result = await bulletproofAPI.getData(startDate, endDate, customerId, {
      priority: customerId ? 8 : 10,
      allowStale: true, // CRITICAL: Use cache whenever possible
      maxWait: 15000, // Reduced from 30s to 15s to fail faster
      feedType: 'adscom' // ONLY fetch Ads.com accounts, NOT Compado or Inuvo
    });

    // If result is too large, fail fast
    if (!result.data) {
      throw new Error('No data received from API');
    }

    const loadTime = Date.now() - startTime;

    // Transform data for consistency
    const transformedData = transformApiResponse(result.data, startDate, endDate, customerId);

    // Build response
    const response: ApiResponse = {
      ...transformedData,
      _source: result.source,
      _age: result.age,
      _message: result.message,
      _quotaStatus: result.quotaStatus,
      _systemHealth: bulletproofAPI.getHealthStatus(),
      _loadTime: loadTime
    };

    // Log performance
    console.log(`[PRODUCTION_API] Response in ${loadTime}ms: ${result.source} data, ${transformedData.ads?.length || 0} ads`);

    // Set appropriate headers based on data source
    const headers: Record<string, string> = {
      'X-Data-Source': result.source.toUpperCase(),
      'X-Load-Time': loadTime.toString(),
      'X-System-Health': response._systemHealth.systemHealth
    };

    if (result.age) {
      headers['X-Data-Age'] = Math.round(result.age / 1000).toString();
    }

    // Cache control based on data source
    if (result.source === 'cache') {
      headers['Cache-Control'] = 'public, max-age=300'; // 5 minutes for cached data
    } else {
      headers['Cache-Control'] = 'no-cache, must-revalidate'; // Fresh data should not be cached by browser
    }

    return NextResponse.json(response, { headers });

  } catch (error) {
    const loadTime = Date.now() - startTime;
    console.error('[PRODUCTION_API] Request failed:', error);

    const systemHealth = await bulletproofAPI.getHealthStatus();

    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      _systemHealth: systemHealth,
      _loadTime: loadTime,
      _source: 'error'
    }, { 
      status: 500,
      headers: {
        'X-System-Health': systemHealth.systemHealth,
        'X-Load-Time': loadTime.toString()
      }
    });
  }
}

/**
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const systemHealth = bulletproofAPI.getHealthStatus();
    
    return NextResponse.json({
      status: (await systemHealth).systemHealth,
      version: '3.0.0-production',
      ...systemHealth,
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

/**
 * Transform API response for consistency
 */
function transformApiResponse(
  data: any,
  startDate: string,
  endDate: string,
  customerId: string | null
): any {
  if (!data || !data.ads) {
    console.warn('[PRODUCTION_API] Invalid data structure, returning empty result');
    return { ads: [], campaigns: [], total_cost: 0 };
  }

  let filteredAds = Array.isArray(data.ads) ? data.ads : [];
  
  // Filter by customer ID if specified
  if (customerId && customerId !== 'all') {
    const originalCount = filteredAds.length;
    filteredAds = filteredAds.filter((ad: any) => ad.customer_id === customerId);
    console.log(`[PRODUCTION_API] Filtered by customer ${customerId}: ${filteredAds.length}/${originalCount} ads`);
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
    console.log(`[PRODUCTION_API] Removed ${preTaboolaCount - filteredAds.length} Taboola ads`);
  }

  // Calculate total cost with validation
  const totalCost = filteredAds.reduce((sum: number, ad: any) => {
    const cost = ad?.metrics?.cost || 0;
    return sum + (typeof cost === 'number' && !isNaN(cost) ? cost : 0);
  }, 0);

  return {
    ads: filteredAds,
    campaigns: data.campaigns || [],
    total_cost: Math.round(totalCost * 100) / 100,
    _transformedAt: new Date().toISOString(),
    _adCount: filteredAds.length,
    _originalAdCount: data.ads?.length || 0
  };
}
