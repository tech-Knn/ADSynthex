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
// Advanced in-process cache with smart refresh
// to avoid overwhelming Google Ads API with
// burst requests that cause QPS rate limits.
// ──────────────────────────────────────────
interface CachedGAData {
  timestamp: number;
  payload: any;
  refreshing?: boolean; // Track if currently being refreshed
}

const GA_CACHE: Record<string, CachedGAData> = (globalThis as any).__GA_CACHE__ || {};
(globalThis as any).__GA_CACHE__ = GA_CACHE;

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours - longer cache to reduce API calls
const STALE_TTL_MS = 30 * 60 * 1000; // 30 minutes - serve stale data, but trigger refresh
const EMERGENCY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - emergency fallback cache

// Circuit breaker to temporarily disable API when it's consistently failing
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  lastSuccess: number;
}

const CIRCUIT_BREAKER: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  lastSuccess: Date.now()
};

const CIRCUIT_BREAKER_CONFIG = {
  maxFailures: 3, // Open circuit after 3 consecutive failures
  resetTimeout: 5 * 60 * 1000, // 5 minutes before trying to close circuit
  failureWindow: 10 * 60 * 1000 // 10 minutes window for counting failures
};

// Global request coordinator to prevent duplicate API calls
const PENDING_REQUESTS: Record<string, Promise<any>> = {};

// Circuit breaker helper functions
function recordApiSuccess() {
  CIRCUIT_BREAKER.failures = 0;
  CIRCUIT_BREAKER.lastSuccess = Date.now();
  CIRCUIT_BREAKER.isOpen = false;
  console.log('[CIRCUIT] API success recorded, circuit closed');
}

function recordApiFailure() {
  const now = Date.now();
  CIRCUIT_BREAKER.failures++;
  CIRCUIT_BREAKER.lastFailure = now;
  
  // Open circuit if too many failures in the time window
  if (CIRCUIT_BREAKER.failures >= CIRCUIT_BREAKER_CONFIG.maxFailures) {
    CIRCUIT_BREAKER.isOpen = true;
    console.log(`[CIRCUIT] Circuit opened after ${CIRCUIT_BREAKER.failures} failures`);
  }
  
  console.log(`[CIRCUIT] API failure recorded (${CIRCUIT_BREAKER.failures}/${CIRCUIT_BREAKER_CONFIG.maxFailures})`);
}

function shouldAttemptApiCall(): boolean {
  const now = Date.now();
  
  // If circuit is closed, allow API calls
  if (!CIRCUIT_BREAKER.isOpen) {
    return true;
  }
  
  // If circuit is open but reset timeout has passed, try to close it
  if (now - CIRCUIT_BREAKER.lastFailure >= CIRCUIT_BREAKER_CONFIG.resetTimeout) {
    console.log('[CIRCUIT] Reset timeout passed, attempting to close circuit');
    CIRCUIT_BREAKER.isOpen = false;
    CIRCUIT_BREAKER.failures = 0;
    return true;
  }
  
  console.log('[CIRCUIT] Circuit is open, skipping API call');
  return false;
}

// Data validation and correction
function validateAndCorrectCostData(data: any): any {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid cost data structure');
  }
  
  // Ensure ads array exists and is valid
  if (!Array.isArray(data.ads)) {
    console.warn('[VALIDATE] Invalid ads array, correcting...');
    data.ads = [];
  }
  
  // Validate and correct each ad's metrics
  data.ads = data.ads.map((ad: any, index: number) => {
    if (!ad || typeof ad !== 'object') {
      console.warn(`[VALIDATE] Invalid ad at index ${index}, skipping`);
      return null;
    }
    
    // Ensure metrics exist
    if (!ad.metrics || typeof ad.metrics !== 'object') {
      console.warn(`[VALIDATE] Missing metrics for ad ${index}, adding defaults`);
      ad.metrics = {};
    }
    
    // Ensure all numeric fields are valid numbers
    const numericFields = ['cost', 'clicks', 'impressions', 'conversions', 'ctr', 'cpc'];
    numericFields.forEach(field => {
      const value = parseFloat(ad.metrics[field]);
      ad.metrics[field] = isNaN(value) || value < 0 ? 0 : value;
    });
    
    // Recalculate derived metrics to ensure accuracy
    const clicks = ad.metrics.clicks || 0;
    const conversions = ad.metrics.conversions || 0;
    const cost = ad.metrics.cost || 0;
    
    ad.metrics.conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;
    ad.metrics.cpa = conversions > 0 ? cost / conversions : 0;
    
    return ad;
  }).filter(Boolean); // Remove null entries
  
  // Recalculate total cost to ensure accuracy
  data.total_cost = data.ads.reduce((sum: number, ad: any) => sum + (ad.metrics.cost || 0), 0);
  
  console.log(`[VALIDATE] Validated ${data.ads.length} ads with total cost: $${data.total_cost.toFixed(2)}`);
  return data;
}

// Smart background refresh - spread out over time
async function scheduleSmartRefresh(cacheKey: string, delayMs: number = 0) {
  setTimeout(async () => {
    // Skip if already refreshing or recently refreshed
    const cached = GA_CACHE[cacheKey];
    if (!cached || cached.refreshing || Date.now() - cached.timestamp < STALE_TTL_MS) {
      return;
    }

    // Check circuit breaker before attempting API call
    if (!shouldAttemptApiCall()) {
      console.log(`[SMART REFRESH] Circuit breaker open, skipping refresh for ${cacheKey}`);
      // Schedule retry when circuit might be closed
      scheduleSmartRefresh(cacheKey, CIRCUIT_BREAKER_CONFIG.resetTimeout);
      return;
    }

    // Mark as refreshing
    cached.refreshing = true;
    
    try {
      const [startDate, endDate, customerId] = cacheKey.split('|');
      console.log(`[SMART REFRESH] Starting refresh for ${cacheKey}`);
      
      const realData = await fetchGoogleAdsData(startDate, endDate);
      if (!realData || typeof realData !== 'object' || !Array.isArray(realData.ads)) {
        throw new Error('Invalid Google Ads API response during smart refresh');
      }
      
      const transformedData = transformApiResponse(realData, startDate, endDate, customerId !== 'all' ? customerId : null);
      const validatedData = validateAndCorrectCostData(transformedData);
      
      GA_CACHE[cacheKey] = { 
        timestamp: Date.now(), 
        payload: validatedData,
        refreshing: false 
      };
      
      recordApiSuccess(); // Record successful API call
      console.log(`[SMART REFRESH] Successfully updated GoogleAds cache for ${cacheKey}`);
      
      // Schedule next refresh in 2 hours + random jitter to spread load
      const nextRefreshDelay = CACHE_TTL_MS + Math.random() * 30 * 60 * 1000; // +0-30min jitter
      scheduleSmartRefresh(cacheKey, nextRefreshDelay);
      
    } catch (err) {
      recordApiFailure(); // Record API failure for circuit breaker
      console.error(`[SMART REFRESH] Failed to refresh GoogleAds cache for ${cacheKey}:`, err);
      
      // Remove refreshing flag
      if (GA_CACHE[cacheKey]) {
        GA_CACHE[cacheKey].refreshing = false;
      }
      
      // Schedule retry based on circuit breaker state
      const retryDelay = CIRCUIT_BREAKER.isOpen ? 
        CIRCUIT_BREAKER_CONFIG.resetTimeout : 
        10 * 60 * 1000; // 10 minutes if circuit is closed
      
      scheduleSmartRefresh(cacheKey, retryDelay);
    }
  }, delayMs);
}

// Helper to build cache key
const buildCacheKey = (start: string, end: string, cid: string | null) => `${start}|${end}|${cid ?? 'all'}`;

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, customerId } = await request.json();
    console.log(`Google Ads API request for date range: ${startDate} to ${endDate}, Customer ID: ${customerId || 'All'}`);
    console.log('DEBUG: Current time', new Date().toISOString());
    
    const cacheKey = buildCacheKey(startDate, endDate, customerId);
    const cached = GA_CACHE[cacheKey];
    const now = Date.now();

    // 1) If we have fresh cache data (< 2 hours old), return it immediately
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[CACHE] Returning fresh cached data for ${cacheKey}`);
      return NextResponse.json(cached.payload, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': Math.floor((now - cached.timestamp) / 1000).toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // 2) If we have stale cache data (> 30 min old but < 2 hours), return it but trigger refresh
    if (cached && (now - cached.timestamp >= STALE_TTL_MS) && (now - cached.timestamp < CACHE_TTL_MS)) {
      // Trigger smart refresh if not already refreshing and circuit allows
      if (!cached.refreshing && shouldAttemptApiCall()) {
        scheduleSmartRefresh(cacheKey, Math.random() * 5000); // 0-5 second jitter
      }
      console.log(`[CACHE] Returning stale cached data for ${cacheKey}`);
      return NextResponse.json(cached.payload, {
        headers: {
          'X-Cache': 'STALE',
          'X-Cache-Age': Math.floor((now - cached.timestamp) / 1000).toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // 3) If we have very stale cache data (> 2 hours old), use it as emergency fallback
    if (cached && (now - cached.timestamp < EMERGENCY_CACHE_TTL_MS)) {
      // Start background refresh for next time if circuit allows
      if (!cached.refreshing && shouldAttemptApiCall()) {
        scheduleSmartRefresh(cacheKey, Math.random() * 10000); // 0-10 second jitter
      }
      console.log(`[CACHE] Returning very stale cached data as emergency fallback for ${cacheKey}`);
      return NextResponse.json(cached.payload, {
        headers: {
          'X-Cache': 'EMERGENCY_FALLBACK',
          'X-Cache-Age': Math.floor((now - cached.timestamp) / 1000).toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // 4) No cache data - check if someone else is already fetching this
    if (cacheKey in PENDING_REQUESTS) {
      console.log(`[DEDUP] Request already in progress for ${cacheKey}, waiting...`);
      try {
        const result = await PENDING_REQUESTS[cacheKey];
        return NextResponse.json(result, {
          headers: {
            'X-Cache': 'DEDUP',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      } catch (err) {
        console.error(`[DEDUP] Failed to get result from pending request for ${cacheKey}:`, err);
        // Fall through to make our own request
      }
    }

    // 5) No cache data available - check circuit breaker before attempting fresh request
    if (!shouldAttemptApiCall()) {
      console.log(`[CIRCUIT] Circuit breaker open, cannot fetch fresh data for ${cacheKey}`);
      return NextResponse.json({
        error: 'Google Ads API temporarily unavailable. Circuit breaker is open due to repeated failures.',
        _circuitOpen: true,
        _nextAttempt: new Date(CIRCUIT_BREAKER.lastFailure + CIRCUIT_BREAKER_CONFIG.resetTimeout).toISOString()
      }, {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Retry-After': Math.ceil(CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000).toString()
        },
      });
    }
    
    console.log(`[FRESH] Making fresh API request for ${cacheKey}`);
    
    // Create and store pending request to prevent duplicates
    const pendingRequest = (async () => {
      try {
        // Check quota status before making API calls
        const quotaStatus = getQuotaStatus();
        console.log('[FRESH] Google Ads API quota status:', quotaStatus);
        
        if (quotaStatus.remainingRequests <= 0) {
          console.warn('[FRESH] Google Ads API daily quota exceeded');
          throw new Error('Daily API quota exceeded. Please try again tomorrow.');
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
          console.warn(`[FRESH] Missing environment variables for Google Ads API: ${missingVars.join(', ')}`);
          throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
        }
        
        // Try to fetch real data with the provided date range
        console.log(`[FRESH] Fetching Google Ads data for ${startDate} to ${endDate}${customerId ? `, customer ID: ${customerId}` : ''}`);
        console.log(`[FRESH] Remaining API quota: ${quotaStatus.remainingRequests} requests`);
        
        const realData = await fetchGoogleAdsData(startDate, endDate);
        
        // Check if we got meaningful data
        if (!realData || typeof realData !== 'object' || !Array.isArray(realData.ads)) {
          throw new Error('Invalid Google Ads API response');
        }
        
        const transformedData = transformApiResponse(realData, startDate, endDate, customerId !== 'all' ? customerId : null);
        const validatedData = validateAndCorrectCostData(transformedData);
        
        // Cache the result with refreshing flag set to false
        GA_CACHE[cacheKey] = { 
          timestamp: Date.now(), 
          payload: validatedData, 
          refreshing: false 
        };
        
        recordApiSuccess(); // Record successful API call
        
        // Schedule next smart refresh in 2+ hours with jitter
        const nextRefreshDelay = CACHE_TTL_MS + Math.random() * 30 * 60 * 1000; // +0-30min jitter
        scheduleSmartRefresh(cacheKey, nextRefreshDelay);
        
        console.log(`[FRESH] Successfully cached validated Google Ads data for ${cacheKey}`);
        return validatedData;
        
      } catch (err) {
        recordApiFailure(); // Record API failure for circuit breaker
        throw err;
      } finally {
        // Always clean up pending request
        delete PENDING_REQUESTS[cacheKey];
      }
    })();
    
    PENDING_REQUESTS[cacheKey] = pendingRequest;
    
    try {
      const result = await pendingRequest;
      return NextResponse.json(result, {
        headers: {
          'X-Cache': 'MISS',
          'X-Circuit-State': CIRCUIT_BREAKER.isOpen ? 'OPEN' : 'CLOSED',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } catch (err) {
      console.error('[FRESH] Google Ads API fetch failed:', err);
      
      // Check if we have any emergency fallback cache data
      const emergencyCache = Object.entries(GA_CACHE).find(([key, data]) => {
        const [cacheStartDate, cacheEndDate] = key.split('|');
        return cacheStartDate === startDate && cacheEndDate === endDate;
      });
      
      if (emergencyCache) {
        const [emergencyCacheKey, emergencyData] = emergencyCache;
        console.log(`[EMERGENCY] Using emergency fallback cache: ${emergencyCacheKey}`);
        return NextResponse.json(emergencyData.payload, {
          headers: {
            'X-Cache': 'EMERGENCY_FALLBACK',
            'X-Cache-Age': Math.floor((Date.now() - emergencyData.timestamp) / 1000).toString(),
            'X-Circuit-State': CIRCUIT_BREAKER.isOpen ? 'OPEN' : 'CLOSED',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }
      
      // No fallback available - return error with circuit breaker info
      return NextResponse.json({
        error: 'Failed to fetch Google Ads cost data and no cached data available.',
        _errorDetails: (err as Error).message,
        _circuitState: CIRCUIT_BREAKER.isOpen ? 'OPEN' : 'CLOSED',
        _circuitFailures: CIRCUIT_BREAKER.failures,
        _retryAfter: CIRCUIT_BREAKER.isOpen ? 
          Math.ceil((CIRCUIT_BREAKER.lastFailure + CIRCUIT_BREAKER_CONFIG.resetTimeout - Date.now()) / 1000) : 
          60
      }, {
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Circuit-State': CIRCUIT_BREAKER.isOpen ? 'OPEN' : 'CLOSED',
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