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
    
    // Filter out Taboola data with cost tracking
    if (filteredAds && filteredAds.length > 0) {
      const originalCount = filteredAds.length;
      const originalCost = filteredAds.reduce((sum: number, ad: any) => sum + (ad.metrics?.cost || 0), 0);
      
      // Filter out any ads with 'taboola' in final_urls (case-insensitive)
      const taboolaFilteredAds = filteredAds.filter((ad: any) => {
        if (!ad.final_urls || !Array.isArray(ad.final_urls)) return true;
        
        // Check if any URL contains "taboola"
        const hasTaboolaUrl = ad.final_urls.some((url: string) => 
          url.toLowerCase().includes('taboola')
        );
        
        return !hasTaboolaUrl;
      });
      
      const filteredCost = taboolaFilteredAds.reduce((sum: number, ad: any) => sum + (ad.metrics?.cost || 0), 0);
      const costDifference = originalCost - filteredCost;
      
      console.log(`[TABOOLA FILTER] Before: ${originalCount} ads, $${originalCost.toFixed(2)} cost`);
      console.log(`[TABOOLA FILTER] After: ${taboolaFilteredAds.length} ads, $${filteredCost.toFixed(2)} cost`);
      
      if (originalCount !== taboolaFilteredAds.length) {
        console.log(`[TABOOLA FILTER] Removed ${originalCount - taboolaFilteredAds.length} ads with $${costDifference.toFixed(2)} cost`);
      }
      
      filteredAds = taboolaFilteredAds;
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
  costPriority?: boolean; // Flag for cost-critical requests
  lastCostUpdate?: number; // Track when cost data was last updated
}

const GA_CACHE: Record<string, CachedGAData> = (globalThis as any).__GA_CACHE__ || {};
(globalThis as any).__GA_CACHE__ = GA_CACHE;

// REAL-TIME COST DATA optimization - aggressive refresh for accurate financial data
const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes - fresh cost data (more frequent)
const STALE_TTL_MS = 4 * 60 * 1000; // 4 minutes - trigger refresh faster for cost accuracy
const COST_PRIORITY_TTL_MS = 2 * 60 * 1000; // 2 minutes - high priority for cost requests
const EMERGENCY_CACHE_TTL_MS = 1 * 60 * 60 * 1000; // 1 hour - reduced emergency cache

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
  maxFailures: 3, // Open circuit after 3 consecutive failures (less aggressive)
  resetTimeout: 10 * 60 * 1000, // 10 minutes before trying to close circuit (faster recovery)
  failureWindow: 30 * 60 * 1000, // 30 minutes window for counting failures
  longRetryThreshold: 3600, // 1 hour - if retry delay is longer than this, extend circuit breaker
  extendedResetTimeout: 1 * 60 * 60 * 1000 // 1 hour - reduced for faster recovery
};

// Global request coordinator to prevent duplicate API calls
const PENDING_REQUESTS: Record<string, Promise<any>> = {};

// Global throttling to prevent QPS exceedance
let activeRefreshCount = 0;
const MAX_CONCURRENT_REFRESHES = 2; // Never have more than 2 cache refreshes running simultaneously

// Automatic periodic refresh system for fresh financial data
const PERIODIC_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes - check for stale data
let periodicRefreshTimer: NodeJS.Timeout | null = null;

// Start automatic periodic refresh system
function startPeriodicRefreshSystem() {
  if (periodicRefreshTimer) {
    clearInterval(periodicRefreshTimer);
  }
  
  periodicRefreshTimer = setInterval(async () => {
    const now = Date.now();
    console.log(`[PERIODIC REFRESH] Checking for stale cache data at ${new Date().toISOString()}`);
    
    // Find all cache entries that need refreshing
    const staleCacheKeys = Object.entries(GA_CACHE).filter(([cacheKey, cacheData]) => {
      const age = now - cacheData.timestamp;
      const needsRefresh = age >= STALE_TTL_MS && !cacheData.refreshing;
      return needsRefresh && shouldAttemptApiCall();
    }).map(([cacheKey]) => cacheKey);
    
    if (staleCacheKeys.length === 0) {
      console.log(`[PERIODIC REFRESH] No stale cache data found`);
      return;
    }
    
    console.log(`[PERIODIC REFRESH] Found ${staleCacheKeys.length} stale cache entries, scheduling refreshes`);
    
    // Limit to prevent QPS exceedance - only refresh the most critical ones
    const maxRefreshesPerCycle = Math.max(1, MAX_CONCURRENT_REFRESHES - activeRefreshCount);
    const priorityStaleCacheKeys = staleCacheKeys.slice(0, maxRefreshesPerCycle);
    
    // Refresh stale entries with staggered timing to respect QPS limits
    priorityStaleCacheKeys.forEach((cacheKey, index) => {
      const delay = index * 10000; // 10 second delays between refreshes (safer)
      scheduleSmartRefresh(cacheKey, delay);
    });
    
  }, PERIODIC_REFRESH_INTERVAL);
  
  console.log(`[PERIODIC REFRESH] Started automatic refresh system (${PERIODIC_REFRESH_INTERVAL/1000/60} minute intervals)`);
}

// Initialize periodic refresh system on module load
startPeriodicRefreshSystem();

// Cache warming function for frequently used date ranges
async function warmCacheForCommonDateRanges() {
  console.log(`[COST-PRIORITY WARMING] Starting cost-priority cache warm-up for common date ranges`);
  
  const today = new Date();
  const commonRanges = [
    // Today - HIGHEST PRIORITY for real-time cost data
    { 
      startDate: today.toISOString().split('T')[0], 
      endDate: today.toISOString().split('T')[0],
      priority: 'HIGH'
    },
    // Yesterday - HIGH PRIORITY for recent cost comparison
    {
      startDate: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: 'HIGH'
    },
    // Last 3 days - MEDIUM PRIORITY
    {
      startDate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      priority: 'MEDIUM'
    }
  ];
  
  // Cost-priority cache warming
  for (let i = 0; i < commonRanges.length; i++) {
    const range = commonRanges[i];
    const cacheKey = buildCacheKey(range.startDate, range.endDate, null);
    
    // Check if needs warming based on cost priority
    const cached = GA_CACHE[cacheKey];
    const isCostPriority = range.priority === 'HIGH' || range.priority === 'MEDIUM';
    const ttlToUse = isCostPriority ? COST_PRIORITY_TTL_MS : CACHE_TTL_MS;
    
    if (!cached || (Date.now() - cached.timestamp) > ttlToUse) {
      const delay = range.priority === 'HIGH' ? i * 8000 : i * 15000; // Faster for high priority cost data
      
      console.log(`[COST-PRIORITY WARMING] Warming ${range.priority} priority cache for ${range.startDate} to ${range.endDate}`);
      scheduleSmartRefresh(cacheKey, delay, isCostPriority);
    }
  }
}

// Start cache warming 30 seconds after module load (allow system to stabilize)
setTimeout(warmCacheForCommonDateRanges, 30000);

// Circuit breaker helper functions
function recordApiSuccess() {
  CIRCUIT_BREAKER.failures = 0;
  CIRCUIT_BREAKER.lastSuccess = Date.now();
  CIRCUIT_BREAKER.isOpen = false;
  console.log('[CIRCUIT] API success recorded, circuit closed');
}

function recordApiFailure(retryAfterSeconds?: number) {
  const now = Date.now();
  CIRCUIT_BREAKER.failures++;
  CIRCUIT_BREAKER.lastFailure = now;
  
  // Open circuit if too many failures in the time window
  if (CIRCUIT_BREAKER.failures >= CIRCUIT_BREAKER_CONFIG.maxFailures) {
    CIRCUIT_BREAKER.isOpen = true;
    
    // If the API is asking us to retry after a very long time (like 7000+ seconds),
    // extend the circuit breaker timeout to prevent premature API calls
    if (retryAfterSeconds && retryAfterSeconds >= CIRCUIT_BREAKER_CONFIG.longRetryThreshold) {
      const extendedTimeout = Math.min(retryAfterSeconds * 1000, CIRCUIT_BREAKER_CONFIG.extendedResetTimeout);
      console.log(`[CIRCUIT] Long retry delay detected (${retryAfterSeconds}s), extending circuit timeout to ${extendedTimeout/1000/60} minutes`);
      // Temporarily store the extended timeout
      (CIRCUIT_BREAKER as any).extendedTimeout = extendedTimeout;
    }
    
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
  
  // Check if we have an extended timeout (for long retry delays)
  const extendedTimeout = (CIRCUIT_BREAKER as any).extendedTimeout;
  const timeoutToUse = extendedTimeout || CIRCUIT_BREAKER_CONFIG.resetTimeout;
  
  // If circuit is open but reset timeout has passed, try to close it
  if (now - CIRCUIT_BREAKER.lastFailure >= timeoutToUse) {
    console.log(`[CIRCUIT] Reset timeout passed (${timeoutToUse/1000/60} minutes), attempting to close circuit`);
    CIRCUIT_BREAKER.isOpen = false;
    CIRCUIT_BREAKER.failures = 0;
    // Clear extended timeout
    delete (CIRCUIT_BREAKER as any).extendedTimeout;
    return true;
  }
  
  const remainingTime = Math.ceil((timeoutToUse - (now - CIRCUIT_BREAKER.lastFailure)) / 1000 / 60);
  console.log(`[CIRCUIT] Circuit is open, skipping API call (${remainingTime} minutes remaining)`);
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
async function scheduleSmartRefresh(cacheKey: string, delayMs: number = 0, costPriority: boolean = false) {
  setTimeout(async () => {
    // Skip if already refreshing
    const cached = GA_CACHE[cacheKey];
    if (!cached || cached.refreshing) {
      return;
    }
    
    // Cost-priority evaluation: refresh more aggressively for cost data
    const age = Date.now() - cached.timestamp;
    const needsRefresh = costPriority 
      ? age > COST_PRIORITY_TTL_MS 
      : age > STALE_TTL_MS;
      
    if (!needsRefresh) {
      return;
    }

    // Check if we have too many concurrent refreshes (prevent QPS exceedance)
    if (activeRefreshCount >= MAX_CONCURRENT_REFRESHES) {
      console.log(`[SMART REFRESH] Max concurrent refreshes (${MAX_CONCURRENT_REFRESHES}) reached, delaying ${cacheKey}`);
      scheduleSmartRefresh(cacheKey, 30000); // Retry in 30 seconds
      return;
    }

    // Check circuit breaker before attempting API call
    if (!shouldAttemptApiCall()) {
      console.log(`[SMART REFRESH] Circuit breaker open, skipping refresh for ${cacheKey}`);
      // Schedule retry when circuit might be closed
      scheduleSmartRefresh(cacheKey, CIRCUIT_BREAKER_CONFIG.resetTimeout);
      return;
    }

    // Mark as refreshing and increment active count
    cached.refreshing = true;
    activeRefreshCount++;
    
    try {
      const [startDate, endDate, customerId] = cacheKey.split('|');
      console.log(`[SMART REFRESH] Starting ${costPriority ? 'COST-PRIORITY' : 'regular'} refresh for ${cacheKey}`);
      
      const realData = await fetchGoogleAdsData(startDate, endDate);
      if (!realData || typeof realData !== 'object' || !Array.isArray(realData.ads)) {
        throw new Error('Invalid Google Ads API response during smart refresh');
      }
      
      const transformedData = transformApiResponse(realData, startDate, endDate, customerId !== 'all' ? customerId : null);
      const validatedData = validateAndCorrectCostData(transformedData);
      
      GA_CACHE[cacheKey] = { 
        timestamp: Date.now(), 
        payload: validatedData,
        refreshing: false,
        costPriority: costPriority,
        lastCostUpdate: costPriority ? Date.now() : cached.lastCostUpdate
      };
      
      recordApiSuccess(); // Record successful API call
      console.log(`[SMART REFRESH] Successfully updated GoogleAds cache for ${cacheKey}`);
      
      // Schedule next refresh after cache TTL + small jitter for load distribution
      const nextRefreshDelay = CACHE_TTL_MS + Math.random() * 5 * 60 * 1000; // +0-5min jitter
      scheduleSmartRefresh(cacheKey, nextRefreshDelay);
      
    } catch (err) {
      // Try to extract retry delay from error for circuit breaker
      let retryAfterSeconds: number | undefined;
      try {
        const errorStr = String(err);
        const retryMatch = errorStr.match(/Retry in (\d+) seconds/);
        if (retryMatch) {
          retryAfterSeconds = parseInt(retryMatch[1], 10);
        }
      } catch (parseErr) {
        // Ignore parsing errors
      }
      
      recordApiFailure(retryAfterSeconds); // Record API failure for circuit breaker
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
    } finally {
      // Always decrement active count to prevent deadlock
      activeRefreshCount = Math.max(0, activeRefreshCount - 1);
      console.log(`[SMART REFRESH] Active refresh count: ${activeRefreshCount}`);
    }
  }, delayMs);
}

// Background preloader for individual accounts - runs once to populate cache
let preloaderRunning = false;
async function startAccountPreloader(startDate: string, endDate: string) {
  if (preloaderRunning) return;
  preloaderRunning = true;
  
  console.log('[PRELOADER] Starting background account data preloader');
  
  // Get account list from config
  const accounts = [
    '8677814915', '9071440966', '5723554317', '3146253756', '5857090949',
    '6201189752', '4071621621', '7579121709', '1918795911', '2849704713', 
    '7605096292', '5719842337', '9341614254', '4277350349'
  ];
  
  // Fetch accounts one by one with delays to avoid rate limits
  for (let i = 0; i < accounts.length; i++) {
    const accountId = accounts[i];
    const accountCacheKey = buildAccountCacheKey(accountId, startDate, endDate);
    
    // Skip if already cached
    if (GA_CACHE[accountCacheKey] && 
        (Date.now() - GA_CACHE[accountCacheKey].timestamp < CACHE_TTL_MS)) {
      console.log(`[PRELOADER] Account ${accountId} already cached, skipping`);
      continue;
    }
    
    if (!shouldAttemptApiCall()) {
      console.log(`[PRELOADER] Circuit breaker open, stopping preloader`);
      break;
    }
    
    try {
      console.log(`[PRELOADER] Fetching data for account ${accountId} (${i + 1}/${accounts.length})`);
      
      const response = await fetchGoogleAdsData(startDate, endDate);
      
      // Filter response to only include this account's data
      const filteredResponse = {
        ...response,
        ads: response.ads?.filter((ad: any) => ad.customer_id === accountId) || []
      };
      
      const transformedData = transformApiResponse(filteredResponse, startDate, endDate, accountId);
      
      // Cache the result
      GA_CACHE[accountCacheKey] = {
        timestamp: Date.now(),
        payload: transformedData,
        refreshing: false
      };
      
      recordApiSuccess();
      console.log(`[PRELOADER] Cached data for account ${accountId}`);
      
      // Wait between accounts to respect rate limits (optimized delay)
      if (i < accounts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
      
    } catch (error) {
      console.error(`[PRELOADER] Failed to fetch account ${accountId}:`, error);
      
      // Extract retry delay from error for circuit breaker
      let retryAfterSeconds: number | undefined;
      try {
        const errorStr = String(error);
        const retryMatch = errorStr.match(/Retry in (\d+) seconds/);
        if (retryMatch) {
          retryAfterSeconds = parseInt(retryMatch[1], 10);
        }
      } catch (parseErr) {
        // Ignore parsing errors
      }
      
      recordApiFailure(retryAfterSeconds);
      
      // If circuit breaker opens, stop preloader
      if (!shouldAttemptApiCall()) {
        console.log(`[PRELOADER] Circuit breaker opened, stopping preloader`);
        break;
      }
      
      // Continue with next account after a delay
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay on error
    }
  }
  
  preloaderRunning = false;
  console.log('[PRELOADER] Background preloader completed');
}

// Helper to build cache key - now account-specific for faster individual account loading
const buildCacheKey = (start: string, end: string, cid: string | null) => `${start}|${end}|${cid ?? 'all'}`;
const buildAccountCacheKey = (accountId: string, start: string, end: string) => `account_${accountId}_${start}_${end}`;

// Smart cache evaluation for cost-priority requests
function isCacheValidForCostData(cached: CachedGAData, isCostPriorityRequest: boolean = true): boolean {
  const now = Date.now();
  const age = now - cached.timestamp;
  
  if (isCostPriorityRequest) {
    // For cost-critical requests, use stricter TTL
    return age < COST_PRIORITY_TTL_MS;
  }
  
  // For regular requests, use standard TTL
  return age < CACHE_TTL_MS;
}

function isCacheStaleButUsable(cached: CachedGAData): boolean {
  const now = Date.now();
  const age = now - cached.timestamp;
  return age < EMERGENCY_CACHE_TTL_MS; // Can still use if not too old
}

// Quick single account refresh for immediate needs
async function scheduleAccountRefresh(accountId: string, startDate: string, endDate: string, delayMs: number = 0) {
  setTimeout(async () => {
    const accountCacheKey = buildAccountCacheKey(accountId, startDate, endDate);
    
    if (GA_CACHE[accountCacheKey]?.refreshing) {
      console.log(`[ACCOUNT REFRESH] Account ${accountId} already refreshing, skipping`);
      return;
    }

    if (!shouldAttemptApiCall()) {
      console.log(`[ACCOUNT REFRESH] Circuit breaker open, skipping account ${accountId}`);
      return;
    }

    try {
      // Mark as refreshing
      if (GA_CACHE[accountCacheKey]) {
        GA_CACHE[accountCacheKey].refreshing = true;
      }

      console.log(`[ACCOUNT REFRESH] Refreshing account ${accountId}`);
      
      const response = await fetchGoogleAdsData(startDate, endDate);
      
      // Filter response to only include this account's data
      const filteredResponse = {
        ...response,
        ads: response.ads?.filter((ad: any) => ad.customer_id === accountId) || []
      };
      
      const transformedData = transformApiResponse(filteredResponse, startDate, endDate, accountId);
      
      // Update cache
      GA_CACHE[accountCacheKey] = {
        timestamp: Date.now(),
        payload: transformedData,
        refreshing: false
      };
      
      recordApiSuccess();
      console.log(`[ACCOUNT REFRESH] Successfully refreshed account ${accountId}`);
      
    } catch (error) {
      console.error(`[ACCOUNT REFRESH] Failed to refresh account ${accountId}:`, error);
      
      // Extract retry delay from error for circuit breaker
      let retryAfterSeconds: number | undefined;
      try {
        const errorStr = String(error);
        const retryMatch = errorStr.match(/Retry in (\d+) seconds/);
        if (retryMatch) {
          retryAfterSeconds = parseInt(retryMatch[1], 10);
        }
      } catch (parseErr) {
        // Ignore parsing errors
      }
      
      recordApiFailure(retryAfterSeconds);
      
      // Remove refreshing flag
      if (GA_CACHE[accountCacheKey]) {
        GA_CACHE[accountCacheKey].refreshing = false;
      }
    }
  }, delayMs);
}

// Try to build aggregated "All" data from individual account caches
function tryBuildFromAccountCaches(startDate: string, endDate: string) {
  const accounts = [
    '8677814915', '9071440966', '5723554317', '3146253756', '5857090949',
    '6201189752', '4071621621', '7579121709', '1918795911', '2849704713', 
    '7605096292', '5719842337', '9341614254', '4277350349'
  ];
  
  const cachedAccounts = [];
  const now = Date.now();
  let oldestCacheAge = 0;
  
  // Check if we have cached data for most accounts (at least 70%)
  for (const accountId of accounts) {
    const accountCacheKey = buildAccountCacheKey(accountId, startDate, endDate);
    const cached = GA_CACHE[accountCacheKey];
    
    if (cached) {
      const age = now - cached.timestamp;
      oldestCacheAge = Math.max(oldestCacheAge, age);
      cachedAccounts.push(cached.payload);
    }
  }
  
  // Only proceed if we have data for at least 70% of accounts and cache is reasonable fresh (< 12 hours)
  if (cachedAccounts.length >= Math.ceil(accounts.length * 0.7) && oldestCacheAge < (12 * 60 * 60 * 1000)) {
    console.log(`[AGGREGATION] Building from ${cachedAccounts.length}/${accounts.length} cached accounts`);
    
    // Aggregate all ads from individual accounts
    const allAds = cachedAccounts.flatMap(account => account.ads || []);
    const allCampaigns = cachedAccounts.flatMap(account => account.campaigns || []);
    
    // Calculate totals
    const totalCost = allAds.reduce((sum, ad) => sum + (parseFloat(ad.metrics?.cost) || 0), 0);
    const totalClicks = allAds.reduce((sum, ad) => sum + (parseInt(ad.metrics?.clicks) || 0), 0);
    const totalImpressions = allAds.reduce((sum, ad) => sum + (parseInt(ad.metrics?.impressions) || 0), 0);
    const totalConversions = allAds.reduce((sum, ad) => sum + (parseInt(ad.metrics?.conversions) || 0), 0);
    
    const averageCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
    const averageCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    
    return {
      ads: allAds,
      campaigns: allCampaigns,
      totalCost,
      totalClicks,
      totalImpressions,
      totalConversions,
      averageCpc,
      averageCtr,
      conversionRate
    };
  }
  
  console.log(`[AGGREGATION] Not enough cached accounts (${cachedAccounts.length}/${accounts.length}) or cache too old`);
  return null;
}

// Fast handler for single account requests using account-specific caching
async function handleSingleAccountRequest(startDate: string, endDate: string, customerId: string, costPriority: boolean = false) {
  const accountCacheKey = buildAccountCacheKey(customerId, startDate, endDate);
  const cached = GA_CACHE[accountCacheKey];
  const now = Date.now();

  // Cost-priority evaluation: refresh more aggressively for cost data
  if (cached) {
    const age = Math.round((now - cached.timestamp) / 1000);
    const isFreshForCost = costPriority ? isCacheValidForCostData(cached, true) : (now - cached.timestamp) < CACHE_TTL_MS;
    
    console.log(`[SINGLE ACCOUNT] ${costPriority ? 'COST-PRIORITY' : 'REGULAR'} request for account ${customerId} (age: ${age}s)`);
    
    // For cost-priority requests, trigger refresh more aggressively
    const shouldRefresh = costPriority 
      ? (now - cached.timestamp) > COST_PRIORITY_TTL_MS 
      : (now - cached.timestamp) > STALE_TTL_MS;
    
    if (shouldRefresh && !cached.refreshing && shouldAttemptApiCall()) {
      const refreshDelay = costPriority ? 500 : 2000; // Faster refresh for cost data
      console.log(`[SINGLE ACCOUNT] Triggering ${costPriority ? 'PRIORITY' : 'background'} refresh for account ${customerId}`);
      scheduleAccountRefresh(customerId, startDate, endDate, refreshDelay);
    }
    
    return NextResponse.json(cached.payload, {
      headers: {
        'X-Cache': costPriority 
          ? (isFreshForCost ? 'HIT-COST-FRESH' : 'HIT-COST-STALE') 
          : (age < STALE_TTL_MS ? 'HIT-ACCOUNT' : 'STALE-ACCOUNT'),
        'X-Cache-Age': age.toString(),
        'X-Data-Status': isFreshForCost ? 'fresh' : 'refreshing',
        'X-Cost-Priority': costPriority ? 'true' : 'false',
      },
    });
  }

  // No cache available - try to get from "All" cache and filter
  const allCacheKey = buildCacheKey(startDate, endDate, null);
  const allCached = GA_CACHE[allCacheKey];
  
  if (allCached && allCached.payload && allCached.payload.ads) {
    console.log(`[SINGLE ACCOUNT] No individual cache, filtering from "All" cache for account ${customerId}`);
    
    // Filter data for this specific account
    const filteredAds = allCached.payload.ads.filter((ad: any) => ad.customer_id === customerId);
    
    const accountData = {
      ...allCached.payload,
      ads: filteredAds,
      totalCost: filteredAds.reduce((sum: number, ad: any) => sum + (parseFloat(ad.metrics?.cost) || 0), 0),
      totalClicks: filteredAds.reduce((sum: number, ad: any) => sum + (parseInt(ad.metrics?.clicks) || 0), 0),
      totalImpressions: filteredAds.reduce((sum: number, ad: any) => sum + (parseInt(ad.metrics?.impressions) || 0), 0),
      totalConversions: filteredAds.reduce((sum: number, ad: any) => sum + (parseInt(ad.metrics?.conversions) || 0), 0),
    };
    
    // Cache this filtered data for faster future access
    GA_CACHE[accountCacheKey] = {
      timestamp: now,
      payload: accountData,
      refreshing: false
    };
    
    return NextResponse.json(accountData, {
      headers: {
        'X-Cache': 'DERIVED-FROM-ALL',
        'X-Cache-Age': Math.floor((now - allCached.timestamp) / 1000).toString(),
      },
    });
  }

  // Last resort: trigger immediate fetch and return loading placeholder with some mock data
  console.log(`[SINGLE ACCOUNT] No cache available, triggering immediate fetch for account ${customerId}`);
  
  if (shouldAttemptApiCall()) {
    // Don't await - trigger background fetch
    scheduleAccountRefresh(customerId, startDate, endDate, 100); // Start immediately
  }
  
  // Return minimal mock data so UI doesn't break (better than empty)
  const placeholderData = {
    ads: [],
    campaigns: [],
    totalCost: 0,
    totalClicks: 0,
    totalImpressions: 0,
    totalConversions: 0,
    averageCpc: 0,
    averageCtr: 0,
    conversionRate: 0
  };
  
  return NextResponse.json(placeholderData, {
    headers: {
      'X-Cache': 'LOADING',
      'X-Message': 'Loading fresh data...',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, customerId } = await request.json();
    console.log(`[COST-PRIORITY] Google Ads API request for date range: ${startDate} to ${endDate}, Customer ID: ${customerId || 'All'}`);
    console.log('DEBUG: Current time', new Date().toISOString());
    
    // For individual accounts, use COST-PRIORITY fast account-specific handler
    if (customerId && customerId !== 'All') {
      return await handleSingleAccountRequest(startDate, endDate, customerId, true); // Cost priority
    }
    
    const cacheKey = buildCacheKey(startDate, endDate, customerId);
    const cached = GA_CACHE[cacheKey];
    const now = Date.now();

    // Try to build "All" data from individual account caches first (much faster)
    const aggregatedData = tryBuildFromAccountCaches(startDate, endDate);
    if (aggregatedData) {
      console.log(`[CACHE] Built "All" data from individual account caches`);
      
      // Cache the aggregated result
      GA_CACHE[cacheKey] = {
        timestamp: Date.now(),
        payload: aggregatedData,
        refreshing: false
      };
      
      return NextResponse.json(aggregatedData, {
        headers: {
          'X-Cache': 'AGGREGATED',
          'X-Cache-Age': '0',
        },
      });
    }

    // Start background preloader to cache individual accounts for faster future access
    if (shouldAttemptApiCall()) {
      startAccountPreloader(startDate, endDate).catch(err => 
        console.error('[PRELOADER] Error starting account preloader:', err)
      );
    }

    // COST-PRIORITY cache evaluation
    if (cached) {
      const age = now - cached.timestamp;
      const isFreshForCost = age < COST_PRIORITY_TTL_MS; // 2 minutes for cost data
      const isRecentlyFresh = age < CACHE_TTL_MS; // 8 minutes general fresh
      
      console.log(`[COST-PRIORITY CACHE] Data age: ${Math.round(age/1000)}s, isFresh: ${isFreshForCost}, isRecent: ${isRecentlyFresh}`);
      
      // If data is getting old for cost purposes, trigger priority refresh
      if (age > COST_PRIORITY_TTL_MS && !cached.refreshing && shouldAttemptApiCall()) {
        console.log(`[COST-PRIORITY CACHE] Triggering cost-priority refresh (age: ${Math.round(age/1000)}s)`);
        scheduleSmartRefresh(cacheKey, 500, true); // Fast cost-priority refresh
      }
      
      // Always serve cached data (never empty) with appropriate cache headers
      const cacheStatus = isFreshForCost ? 'COST-FRESH' : (isRecentlyFresh ? 'FRESH' : 'STALE');
      
      return NextResponse.json(cached.payload, {
        headers: {
          'X-Cache': cacheStatus,
          'X-Cache-Age': Math.floor(age / 1000).toString(),
          'X-Cost-Priority': 'true',
          'X-Data-Status': isFreshForCost ? 'fresh' : 'refreshing',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Emergency fallback - serve very old cache if available
    if (cached && (now - cached.timestamp < EMERGENCY_CACHE_TTL_MS)) {
      // Start immediate cost-priority refresh
      if (!cached.refreshing && shouldAttemptApiCall()) {
        console.log(`[EMERGENCY CACHE] Starting immediate cost-priority refresh for very stale data: ${cacheKey}`);
        scheduleSmartRefresh(cacheKey, 100, true); // Immediate cost-priority refresh
      }
      
      console.log(`[EMERGENCY CACHE] Returning very stale data (age: ${Math.round((now - cached.timestamp)/60000)}min)`);
      return NextResponse.json(cached.payload, {
        headers: {
          'X-Cache': 'EMERGENCY',
          'X-Cache-Age': Math.floor((now - cached.timestamp) / 1000).toString(),
          'X-Cost-Priority': 'true',
          'X-Data-Status': 'refreshing',
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
        
        // Schedule next smart refresh after cache TTL with small jitter
        const nextRefreshDelay = CACHE_TTL_MS + Math.random() * 5 * 60 * 1000; // +0-5min jitter
        scheduleSmartRefresh(cacheKey, nextRefreshDelay);
        
        console.log(`[FRESH] Successfully cached validated Google Ads data for ${cacheKey}`);
        return validatedData;
        
      } catch (err) {
        // Try to extract retry delay from error for circuit breaker
        let retryAfterSeconds: number | undefined;
        try {
          const errorStr = String(err);
          const retryMatch = errorStr.match(/Retry in (\d+) seconds/);
          if (retryMatch) {
            retryAfterSeconds = parseInt(retryMatch[1], 10);
          }
        } catch (parseErr) {
          // Ignore parsing errors
        }
        
        recordApiFailure(retryAfterSeconds); // Record API failure for circuit breaker
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