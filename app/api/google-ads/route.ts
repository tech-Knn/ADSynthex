import { NextRequest, NextResponse } from 'next/server';
import { fetchGoogleAdsData, getMockGoogleAdsData, getQuotaStatus, GoogleAdsAd } from '../../../lib/google-ads-api';

// Helper to transform API response
const transformApiResponse = (response: any, startDate?: string, endDate?: string, customerId?: string | null) => {
  if (!response || !response.campaigns || !response.ads) {
    console.warn('Invalid Google Ads API response structure:', response);
    return getMockGoogleAdsData(startDate, endDate, customerId); // Fall back to mock data with date range
  }
  
  try {
    // Ensure ads have proper structure and metrics
    const transformedAds = response.ads.map((ad: any) => {
      // Basic structure validation
      if (!ad.final_urls || !Array.isArray(ad.final_urls) || !ad.metrics) {
        return null; // Skip invalid ads
      }
      
      // Make sure metrics exist and are numbers
      const metrics: {
        impressions: number;
        clicks: number;
        ctr: number;
        cpc: number;
        cost: number;
        conversions: number;
        conversion_rate?: number;
        cpa?: number;
      } = {
        impressions: parseInt(ad.metrics.impressions) || 0,
        clicks: parseInt(ad.metrics.clicks) || 0,
        ctr: parseFloat(ad.metrics.ctr) || 0,
        cpc: parseFloat(ad.metrics.cpc) || 0,
        cost: parseFloat(ad.metrics.cost) || 0,
        conversions: parseInt(ad.metrics.conversions) || 0
      };
      
      // Add calculated or provided conversion rate and CPA
      const clicks = metrics.clicks;
      const conversions = metrics.conversions;
      const cost = metrics.cost;
      
      // Calculate conversion rate (conversions/clicks)*100
      metrics.conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      
      // Calculate cost per acquisition (cost/conversions)
      metrics.cpa = conversions > 0 ? cost / conversions : 0;
      
      return {
        ...ad,
        metrics
      };
    }).filter(Boolean); // Remove null entries
    
    // Filter by customer ID if provided
    let filteredAds = transformedAds;
    if (customerId) {
      console.log(`Filtering ads by customer ID ${customerId}. Before: ${transformedAds.length} ads`);
      filteredAds = transformedAds.filter((ad: any) => ad.customer_id === customerId);
      console.log(`After filtering: ${filteredAds.length} ads remain`);
    }
    
    // Filter out Taboola data
    if (filteredAds && filteredAds.length > 0) {
      const originalCount = filteredAds.length;
      
      // Filter out any ads with 'taboola' in final_urls (case-insensitive)
      filteredAds = filteredAds.filter((ad: any) => {
        if (!ad.final_urls || !Array.isArray(ad.final_urls)) return true;
        
        // Check if any URL contains "taboola"
        const hasTaboolaUrl = ad.final_urls.some((url: string) => 
          url.toLowerCase().includes('taboola')
        );
        
        return !hasTaboolaUrl;
      });
      
      if (originalCount !== filteredAds.length) {
        console.log(`Filtered out Taboola ads: removed ${originalCount - filteredAds.length} ads`);
      }
    }
    
    // Calculate total cost after filtering
    const totalCost = filteredAds.reduce((sum: number, ad: any) => sum + ad.metrics.cost, 0);
    
    return {
      campaigns: response.campaigns || [],
      ads: filteredAds,
      total_cost: totalCost
    };
  } catch (error) {
    console.error('Error transforming Google Ads API response:', error);
    return getMockGoogleAdsData(startDate, endDate, customerId); // Fall back to mock data with date range
  }
};

// ──────────────────────────────────────────
// Simple in-process cache to avoid hammering
// the Google Ads API when the dashboard makes
// multiple identical requests in quick
// succession (auto-refresh, React re-renders).
// ──────────────────────────────────────────
interface CachedGAData {
  timestamp: number;
  payload: any;
}

const GA_CACHE: Record<string, CachedGAData> = (globalThis as any).__GA_CACHE__ || {};
(globalThis as any).__GA_CACHE__ = GA_CACHE;

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Track active cache keys for background refresh
const ACTIVE_KEYS = new Set<string>();

// Background refresh every minute
setInterval(async () => {
  for (const cacheKey of ACTIVE_KEYS) {
    const [startDate, endDate, customerId] = cacheKey.split('|');
    try {
      const realData = await fetchGoogleAdsData(startDate, endDate);
      if (!realData || typeof realData !== 'object' || !Array.isArray(realData.ads)) {
        throw new Error('Invalid Google Ads API response during background refresh');
      }
      const transformedData = transformApiResponse(realData, startDate, endDate, customerId !== 'all' ? customerId : null);
      GA_CACHE[cacheKey] = { timestamp: Date.now(), payload: transformedData };
      console.log(`[BG REFRESH] Updated GoogleAds cache for ${cacheKey}`);
    } catch (err) {
      console.error(`[BG REFRESH] Failed to refresh GoogleAds cache for ${cacheKey}:`, err);
      // Do not update cache on error
    }
  }
}, CACHE_TTL_MS);

// Helper to build cache key
const buildCacheKey = (start: string, end: string, cid: string | null) => `${start}|${end}|${cid ?? 'all'}`;

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, customerId } = await request.json();
    console.log(`Google Ads API request for date range: ${startDate} to ${endDate}, Customer ID: ${customerId || 'All'}`);
    console.log('DEBUG: Current time', new Date().toISOString());
    
    // ⏳ 1) Return cached response if still fresh
    const cacheKey = buildCacheKey(startDate, endDate, customerId);
    ACTIVE_KEYS.add(cacheKey);
    const cached = GA_CACHE[cacheKey];

    // Serve cached data immediately if available, even if expired
    if (cached) {
      // Trigger background refresh if cache is expired
      if (Date.now() - cached.timestamp >= CACHE_TTL_MS) {
        (async () => {
          try {
            const realData = await fetchGoogleAdsData(startDate, endDate);
            if (realData && typeof realData === 'object' && Array.isArray(realData.ads)) {
              const transformedData = transformApiResponse(realData, startDate, endDate, customerId !== 'all' ? customerId : null);
              GA_CACHE[cacheKey] = { timestamp: Date.now(), payload: transformedData };
              console.log(`[BG REFRESH] Updated GoogleAds cache for ${cacheKey}`);
            }
          } catch (err) {
            console.error(`[BG REFRESH] Failed to refresh GoogleAds cache for ${cacheKey}:`, err);
          }
        })();
      }
      return NextResponse.json(cached.payload, {
        headers: {
          'X-Cache': Date.now() - cached.timestamp < CACHE_TTL_MS ? 'HIT' : 'STALE',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Debug: Print all environment variables
    console.log('Environment variables:');
    console.log('GOOGLE_ADS_CLIENT_ID:', process.env.GOOGLE_ADS_CLIENT_ID ? 'Set (length: ' + process.env.GOOGLE_ADS_CLIENT_ID.length + ')' : 'Not set');
    console.log('GOOGLE_ADS_CLIENT_SECRET:', process.env.GOOGLE_ADS_CLIENT_SECRET ? 'Set (length: ' + process.env.GOOGLE_ADS_CLIENT_SECRET.length + ')' : 'Not set');
    console.log('GOOGLE_ADS_REFRESH_TOKEN:', process.env.GOOGLE_ADS_REFRESH_TOKEN ? 'Set (length: ' + process.env.GOOGLE_ADS_REFRESH_TOKEN.length + ')' : 'Not set');
    console.log('GOOGLE_ADS_DEVELOPER_TOKEN:', process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? 'Set (length: ' + process.env.GOOGLE_ADS_DEVELOPER_TOKEN.length + ')' : 'Not set');
    console.log('GOOGLE_ADS_MANAGER_ID:', process.env.GOOGLE_ADS_MANAGER_ID ? 'Set (length: ' + process.env.GOOGLE_ADS_MANAGER_ID.length + ')' : 'Not set');
    
    try {
      // Check quota status before making API calls
      const quotaStatus = getQuotaStatus();
      console.log('Google Ads API quota status:', quotaStatus);
      
      if (quotaStatus.remainingRequests <= 0) {
        console.warn('Google Ads API daily quota exceeded, using mock data');
        const mockData = getMockGoogleAdsData(startDate, endDate, customerId);
        return NextResponse.json({
          ...mockData,
          _quotaExceeded: true,
          _quotaStatus: quotaStatus,
          _message: 'Daily API quota exceeded. Using mock data.'
        }, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
      
      // Check if we have all required environment variables
      const requiredEnvVars = [
        'GOOGLE_ADS_CLIENT_ID',
        'GOOGLE_ADS_CLIENT_SECRET',
        'GOOGLE_ADS_REFRESH_TOKEN',
        'GOOGLE_ADS_DEVELOPER_TOKEN',
        'GOOGLE_ADS_MANAGER_ID'
      ];
      
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn(`Missing environment variables for Google Ads API: ${missingVars.join(', ')}`);
        throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
      }
      
      // Try to fetch real data with the provided date range
      console.log(`Fetching Google Ads data for ${startDate} to ${endDate}${customerId ? `, customer ID: ${customerId}` : ''}`);
      console.log(`Remaining API quota: ${quotaStatus.remainingRequests} requests`);
      
      const realData = await fetchGoogleAdsData(startDate, endDate);
      
      // Check if we got meaningful data
      if (!realData || typeof realData !== 'object' || !Array.isArray(realData.ads)) {
        throw new Error('Invalid Google Ads API response');
      }
      const transformedData = transformApiResponse(realData, startDate, endDate, customerId !== 'all' ? customerId : null);
      GA_CACHE[cacheKey] = { timestamp: Date.now(), payload: transformedData };
      return NextResponse.json(transformedData, {
        headers: {
          'X-Cache': 'MISS',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } catch (err) {
      console.error('Google Ads API fetch failed:', err);
      return NextResponse.json({
        error: 'Failed to fetch Google Ads cost data and no cached data available.',
        _errorDetails: (err as Error).message
      }, {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
  } catch (error) {
    console.error('Error fetching Google Ads data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Ads data' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || '';
    const endDate = url.searchParams.get('endDate') || '';
    const customerId = url.searchParams.get('customerId') || null;
    
    console.log(`GET: Google Ads API request for date range: ${startDate} to ${endDate}${customerId ? `, customer ID: ${customerId}` : ''}`);
    
    // For debugging, use mock data
    console.log('Using mock Google Ads data for GET debugging');
    const mockData = getMockGoogleAdsData(startDate, endDate, customerId);
    console.log(`Mock data: ${mockData.campaigns.length} campaigns, ${mockData.ads.length} ads`);
    return NextResponse.json(mockData, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Error processing Google Ads GET request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Ads data' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
} 