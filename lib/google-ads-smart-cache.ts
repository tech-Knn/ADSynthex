/**
 * Smart Caching System for Google Ads with Rate Limiting Protection
 * Features:
 * - Account-specific caching (individual + all accounts)
 * - QPS and daily rate limit protection
 * - Background refresh workers
 * - Stale-while-revalidate pattern
 * - Cache consistency across views
 */

import { fetchGoogleAdsData, getMockGoogleAdsData, getQuotaStatus } from './google-ads-api';

// Cache data structure
export interface SmartCacheData {
  timestamp: number;
  payload: any;
  isValid: boolean;
  lastValidated: number;
  costDataOnly?: boolean;
  accountId?: string | null;
  dateRange: string;
  staleAfter: number;
  expires: number;
}

// Rate limiting configuration
interface RateLimitConfig {
  maxQPS: number;              // Max queries per second
  maxDailyRequests: number;    // Max requests per day
  burstLimit: number;          // Max burst requests
  cooldownPeriod: number;      // Cooldown after hitting limits (ms)
  requestWindow: number;       // Time window for QPS calculation (ms)
}

const RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxQPS: 1,                   // Ultra conservative: 1 request per second
  maxDailyRequests: 6000,      // Much lower buffer from 8000 limit
  burstLimit: 2,               // Max 2 requests in burst (very conservative)
  cooldownPeriod: 300000,      // 5 minute cooldown when hit
  requestWindow: 2000          // 2 second window for QPS calculation
};

// Cache TTL configuration
const CACHE_CONFIG = {
  fastTTL: 2 * 60 * 1000,         // 2 minutes for fast data
  costTTL: 15 * 60 * 1000,        // 15 minutes for cost data
  backgroundRefresh: 5 * 60 * 1000, // Start background refresh after 5 minutes
  maxAge: 60 * 60 * 1000,         // 1 hour maximum age
  staleWhileRevalidate: 30 * 60 * 1000 // 30 minutes stale period
};

// Separate cache storage for different data types
const INDIVIDUAL_CACHE: Record<string, SmartCacheData> = (globalThis as any).__INDIVIDUAL_CACHE__ || {};
const INDIVIDUAL_COST_CACHE: Record<string, SmartCacheData> = (globalThis as any).__INDIVIDUAL_COST_CACHE__ || {};
const ALL_ACCOUNTS_CACHE: Record<string, SmartCacheData> = (globalThis as any).__ALL_ACCOUNTS_CACHE__ || {};
const ALL_ACCOUNTS_COST_CACHE: Record<string, SmartCacheData> = (globalThis as any).__ALL_ACCOUNTS_COST_CACHE__ || {};

// Rate limiting state
const RATE_LIMITER = {
  requestTimes: [] as number[],
  dailyCount: 0,
  lastDailyReset: new Date().toDateString(),
  isInCooldown: false,
  cooldownUntil: 0,
  ongoingRequests: new Set<string>()
};

// Background worker state
const BACKGROUND_WORKERS = {
  active: new Set<string>(),
  queue: [] as Array<{accountId: string | null, startDate: string, endDate: string, priority: number}>,
  isProcessing: false
};

// Initialize global storage
(globalThis as any).__INDIVIDUAL_CACHE__ = INDIVIDUAL_CACHE;
(globalThis as any).__INDIVIDUAL_COST_CACHE__ = INDIVIDUAL_COST_CACHE;
(globalThis as any).__ALL_ACCOUNTS_CACHE__ = ALL_ACCOUNTS_CACHE;
(globalThis as any).__ALL_ACCOUNTS_COST_CACHE__ = ALL_ACCOUNTS_COST_CACHE;

// Helper functions
export const buildSmartCacheKey = (startDate: string, endDate: string, accountId: string | null): string => {
  const dateRange = `${startDate}|${endDate}`;
  const account = accountId || 'all';
  return `ga:${account}:${dateRange}`;
};

export const buildCostCacheKey = (startDate: string, endDate: string, accountId: string | null): string => {
  const dateRange = `${startDate}|${endDate}`;
  const account = accountId || 'all';
  return `cost:${account}:${dateRange}`;
};

// Build individual account cache keys for aggregation
export const buildIndividualAccountKeys = (startDate: string, endDate: string): string[] => {
  // List of all account IDs
  const accountIds = [
    '8677814915', // IST
    '9071440966', // UTC-02
    '5723554317', // UTC-03
    '3146253756', // UTC-04
    '5857090949', // UTC-05
    '6201189752', // UTC-06
    '4071621621', // UTC-07
    '7579121709', // UTC-08
    '1918795911', // UTC-09
    '2849704713', // UTC-10
    '7605096292', // UTC-11
    '5719842337', // UTC-12
    '9341614254', // UTC-13
    '4277350349'  // Siddhi
  ];
  
  return accountIds.map(accountId => buildSmartCacheKey(startDate, endDate, accountId));
};

// Rate limiting functions
const resetDailyCounter = (): void => {
  const today = new Date().toDateString();
  if (today !== RATE_LIMITER.lastDailyReset) {
    RATE_LIMITER.dailyCount = 0;
    RATE_LIMITER.lastDailyReset = today;
    console.log('[RATE_LIMITER] Daily counter reset');
  }
};

const isRateLimited = (): boolean => {
  resetDailyCounter();
  
  const now = Date.now();
  
  // Check if in cooldown
  if (RATE_LIMITER.isInCooldown && now < RATE_LIMITER.cooldownUntil) {
    return true;
  } else if (RATE_LIMITER.isInCooldown && now >= RATE_LIMITER.cooldownUntil) {
    RATE_LIMITER.isInCooldown = false;
    console.log('[RATE_LIMITER] Cooldown period ended');
  }
  
  // Check daily limit
  if (RATE_LIMITER.dailyCount >= RATE_LIMIT_CONFIG.maxDailyRequests) {
    console.warn('[RATE_LIMITER] Daily limit reached');
    return true;
  }
  
  // Check QPS limit
  RATE_LIMITER.requestTimes = RATE_LIMITER.requestTimes.filter(
    time => now - time < RATE_LIMIT_CONFIG.requestWindow
  );
  
  if (RATE_LIMITER.requestTimes.length >= RATE_LIMIT_CONFIG.maxQPS) {
    console.warn('[RATE_LIMITER] QPS limit reached');
    return true;
  }
  
  return false;
};

const recordRequest = (): void => {
  const now = Date.now();
  RATE_LIMITER.requestTimes.push(now);
  RATE_LIMITER.dailyCount++;
  
  console.log(`[RATE_LIMITER] Request recorded. Daily: ${RATE_LIMITER.dailyCount}/${RATE_LIMIT_CONFIG.maxDailyRequests}, QPS: ${RATE_LIMITER.requestTimes.length}/${RATE_LIMIT_CONFIG.maxQPS}`);
};

const enterCooldown = (customPeriod?: number): void => {
  const cooldownTime = customPeriod || RATE_LIMIT_CONFIG.cooldownPeriod;
  RATE_LIMITER.isInCooldown = true;
  RATE_LIMITER.cooldownUntil = Date.now() + cooldownTime;
  console.warn(`[RATE_LIMITER] Entering cooldown for ${cooldownTime / 1000} seconds until ${new Date(RATE_LIMITER.cooldownUntil).toISOString()}`);
};

// Enhanced rate limit detection for Google Ads specific errors
export const handleGoogleAdsRateLimit = (error: any): boolean => {
  const errorMessage = error?.message || error?.toString() || '';
  const errorString = JSON.stringify(error);
  
  // Check for "Too many requests" error
  if (errorString.includes('Too many requests') || 
      errorString.includes('Retry in') ||
      errorMessage.includes('RESOURCE_EXHAUSTED') ||
      errorMessage.includes('429')) {
    
    // Extract retry time if available
    const retryMatch = errorString.match(/Retry in (\d+) seconds/);
    const retrySeconds = retryMatch ? parseInt(retryMatch[1]) : 300; // Default 5 minutes
    const cooldownTime = Math.min(retrySeconds * 1000, 1800000); // Max 30 minutes
    
    console.error(`[RATE_LIMITER] Google Ads rate limit detected! Retry in ${retrySeconds} seconds`);
    enterCooldown(cooldownTime);
    return true;
  }
  
  return false;
};

// Cache validation functions
const validateCostData = (data: any): boolean => {
  if (!data) return false;
  
  // Allow empty arrays (valid for accounts with no spend)
  if (!data.ads || !Array.isArray(data.ads)) return false;
  
  // Check for reasonable cost values
  const hasValidCosts = data.ads.every((ad: any) => {
    if (!ad || !ad.metrics) return false;
    const cost = ad.metrics.cost;
    return cost !== undefined && cost >= 0 && cost <= 1000000; // $1M limit
  });
  
  if (!hasValidCosts) {
    console.warn('[CACHE_VALIDATOR] Invalid cost data detected');
    return false;
  }
  
  return true;
};

const extractCostData = (data: any): any => {
  if (!data || !data.ads) return { total_cost: 0, ads: [] };
  
  return {
    total_cost: data.total_cost || 0,
    ads: data.ads.map((ad: any) => ({
      customer_id: ad.customer_id,
      campaign_id: ad.campaign_id,
      ad_id: ad.ad_id,
      metrics: {
        cost: ad.metrics.cost || 0,
        cost_micros: ad.metrics.cost_micros || 0,
        cpc: ad.metrics.cpc || 0,
        cpa: ad.metrics.cpa || 0
      }
    }))
  };
};

// Aggregate individual account data for "all accounts" view
const aggregateAccountData = (individualDataArray: any[]): any => {
  if (!individualDataArray || individualDataArray.length === 0) {
    return null;
  }
  
  const aggregated = {
    campaigns: [],
    ads: [],
    total_cost: 0
  };
  
  individualDataArray.forEach(accountData => {
    if (accountData && accountData.campaigns) {
      aggregated.campaigns.push(...accountData.campaigns);
    }
    if (accountData && accountData.ads) {
      aggregated.ads.push(...accountData.ads);
    }
    if (accountData && typeof accountData.total_cost === 'number') {
      aggregated.total_cost += accountData.total_cost;
    }
  });
  
  return aggregated;
};

// Get cached data for all individual accounts
const getIndividualAccountsData = (startDate: string, endDate: string): {
  data: any[];
  allCached: boolean;
  staleCount: number;
} => {
  const accountKeys = buildIndividualAccountKeys(startDate, endDate);
  const now = Date.now();
  const individualData = [];
  let allCached = true;
  let staleCount = 0;
  
  for (const key of accountKeys) {
    const cached = INDIVIDUAL_CACHE[key];
    if (cached && cached.isValid && now < cached.expires) {
      individualData.push(cached.payload);
    } else if (cached && now < cached.expires + CACHE_CONFIG.staleWhileRevalidate) {
      individualData.push(cached.payload);
      staleCount++;
    } else {
      allCached = false;
      break;
    }
  }
  
  return { data: individualData, allCached, staleCount };
};

// Smart cache retrieval
export const getSmartCachedData = (
  startDate: string, 
  endDate: string, 
  accountId: string | null
): {
  data: any | null;
  cacheStatus: string;
  shouldRefresh: boolean;
  needsBackgroundRefresh: boolean;
} => {
  console.log(`[CACHE_DEBUG] getSmartCachedData called with: accountId=${accountId}, dateRange=${startDate}|${endDate}`);
  
  // Special handling for "all accounts" view
  if (!accountId || accountId === 'all') {
    console.log(`[CACHE_DEBUG] Handling aggregated data for all accounts`);
    return getAggregatedCachedData(startDate, endDate);
  }
  
  // Individual account handling
  const cacheKey = buildSmartCacheKey(startDate, endDate, accountId);
  const costCacheKey = buildCostCacheKey(startDate, endDate, accountId);
  
  console.log(`[CACHE_DEBUG] Looking for cache keys: data=${cacheKey}, cost=${costCacheKey}`);
  
  // Use individual account cache
  const cachedData = INDIVIDUAL_CACHE[cacheKey];
  const cachedCost = INDIVIDUAL_COST_CACHE[costCacheKey];
  
  console.log(`[CACHE_DEBUG] Cache found: data=${!!cachedData}, cost=${!!cachedCost}`);
  if (cachedData) {
    console.log(`[CACHE_DEBUG] Data cache timestamp: ${new Date(cachedData.timestamp).toISOString()}, expires: ${new Date(cachedData.expires).toISOString()}`);
  }
  if (cachedCost) {
    console.log(`[CACHE_DEBUG] Cost cache timestamp: ${new Date(cachedCost.timestamp).toISOString()}, expires: ${new Date(cachedCost.expires).toISOString()}`);
  }
  
  const now = Date.now();
  console.log(`[CACHE_DEBUG] Current time: ${new Date(now).toISOString()}`);
  
  // Check if we have valid cached data
  const hasValidData = cachedData && cachedData.isValid && now < cachedData.expires;
  const hasValidCost = cachedCost && cachedCost.isValid && now < cachedCost.expires;
  
  let shouldRefresh = false;
  let needsBackgroundRefresh = false;
  let data = null;
  let cacheStatus = 'MISS';
  
  if (hasValidData && hasValidCost) {
    // Perfect cache hit - both data and cost are fresh
    data = mergeCostData(cachedData.payload, cachedCost.payload);
    cacheStatus = 'HIT_FULL';
    
    // Check if we need background refresh
    needsBackgroundRefresh = (now > cachedData.staleAfter) || (now > cachedCost.staleAfter);
    
  } else if (hasValidCost) {
    // Cost data is fresh, but other data is stale
    // Return cost data merged with stale data if available
    if (cachedData && now < cachedData.expires + CACHE_CONFIG.staleWhileRevalidate) {
      data = mergeCostData(cachedData.payload, cachedCost.payload);
      cacheStatus = 'HIT_COST_STALE_DATA';
      shouldRefresh = true;
    } else {
      cacheStatus = 'HIT_COST_ONLY';
      shouldRefresh = true;
    }
    
  } else if (hasValidData) {
    // Data is fresh but cost is stale
    data = cachedData.payload;
    cacheStatus = 'HIT_DATA_STALE_COST';
    needsBackgroundRefresh = true;
    
  } else {
    // Check for stale data we can serve while revalidating
    if (cachedData && now < cachedData.expires + CACHE_CONFIG.staleWhileRevalidate) {
      data = cachedData.payload;
      cacheStatus = 'HIT_STALE';
      shouldRefresh = true;
    } else {
      cacheStatus = 'MISS';
      shouldRefresh = true;
    }
  }
  
  return { data, cacheStatus, shouldRefresh, needsBackgroundRefresh };
};

// Handle "all accounts" aggregated view
const getAggregatedCachedData = (
  startDate: string, 
  endDate: string
): {
  data: any | null;
  cacheStatus: string;
  shouldRefresh: boolean;
  needsBackgroundRefresh: boolean;
} => {
  // Check for cached aggregated result in separate "all accounts" cache
  const cacheKey = buildSmartCacheKey(startDate, endDate, null);
  const costCacheKey = buildCostCacheKey(startDate, endDate, null);
  const cachedAggregated = ALL_ACCOUNTS_CACHE[cacheKey];
  const cachedAggregatedCost = ALL_ACCOUNTS_COST_CACHE[costCacheKey];
  const now = Date.now();
  
  // Check if we have valid aggregated cache data
  const hasValidAggregatedData = cachedAggregated && cachedAggregated.isValid && now < cachedAggregated.expires;
  const hasValidAggregatedCost = cachedAggregatedCost && cachedAggregatedCost.isValid && now < cachedAggregatedCost.expires;
  
  if (hasValidAggregatedData && hasValidAggregatedCost) {
    const data = mergeCostData(cachedAggregated.payload, cachedAggregatedCost.payload);
    return {
      data,
      cacheStatus: 'HIT_AGGREGATED_FULL',
      shouldRefresh: false,
      needsBackgroundRefresh: (now > cachedAggregated.staleAfter) || (now > cachedAggregatedCost.staleAfter)
    };
  } else if (hasValidAggregatedData || hasValidAggregatedCost) {
    // Partial cache hit - serve what we have and refresh
    const data = hasValidAggregatedData ? cachedAggregated.payload : cachedAggregatedCost?.payload;
    return {
      data,
      cacheStatus: 'HIT_AGGREGATED_PARTIAL',
      shouldRefresh: true,
      needsBackgroundRefresh: false
    };
  }
  
  // Try to build aggregated data from individual account caches
  const { data: individualData, allCached, staleCount } = getIndividualAccountsData(startDate, endDate);
  
  if (allCached && individualData.length > 0) {
    // We can build aggregated data from individual caches
    const aggregatedData = aggregateAccountData(individualData);
    
    if (aggregatedData) {
      // Store the aggregated result for faster future access
      storeSmartCacheData(startDate, endDate, null, aggregatedData, true);
      
      return {
        data: aggregatedData,
        cacheStatus: staleCount > 0 ? 'HIT_AGGREGATED_STALE' : 'HIT_AGGREGATED_FRESH',
        shouldRefresh: staleCount > 0,
        needsBackgroundRefresh: staleCount > 0
      };
    }
  }
  
  // Check for stale aggregated data
  if (cachedAggregated && now < cachedAggregated.expires + CACHE_CONFIG.staleWhileRevalidate) {
    return {
      data: cachedAggregated.payload,
      cacheStatus: 'HIT_AGGREGATED_STALE',
      shouldRefresh: true,
      needsBackgroundRefresh: false
    };
  }
  
  // No valid data available
  return {
    data: null,
    cacheStatus: 'MISS_AGGREGATED',
    shouldRefresh: true,
    needsBackgroundRefresh: false
  };
};

// Merge cost data with full data
export const mergeCostData = (fullData: any, costData: any): any => {
  if (!fullData || !costData) return fullData;
  
  try {
    const costMap = new Map();
    costData.ads?.forEach((ad: any) => {
      const key = `${ad.customer_id}|${ad.campaign_id}|${ad.ad_id}`;
      costMap.set(key, ad.metrics);
    });
    
    if (fullData.ads) {
      fullData.ads = fullData.ads.map((ad: any) => {
        const key = `${ad.customer_id}|${ad.campaign_id}|${ad.ad_id}`;
        const costMetrics = costMap.get(key);
        
        if (costMetrics) {
          return {
            ...ad,
            metrics: { ...ad.metrics, ...costMetrics }
          };
        }
        return ad;
      });
    }
    
    if (costData.total_cost !== undefined) {
      fullData.total_cost = costData.total_cost;
    }
    
    return fullData;
  } catch (error) {
    console.error('[CACHE] Error merging cost data:', error);
    return fullData;
  }
};

// Store data in smart cache
export const storeSmartCacheData = (
  startDate: string,
  endDate: string,
  accountId: string | null,
  data: any,
  isValid: boolean = true
): void => {
  const now = Date.now();
  const cacheKey = buildSmartCacheKey(startDate, endDate, accountId);
  const costCacheKey = buildCostCacheKey(startDate, endDate, accountId);
  
  console.log(`[CACHE_STORE] Storing data for accountId=${accountId}, keys: data=${cacheKey}, cost=${costCacheKey}`);
  console.log(`[CACHE_STORE] Data has ${data?.ads?.length || 0} ads, total_cost: ${data?.total_cost || 0}`);
  
  // Determine which cache to use
  const isAllAccountsView = !accountId || accountId === 'all';
  const dataCache = isAllAccountsView ? ALL_ACCOUNTS_CACHE : INDIVIDUAL_CACHE;
  const costCache = isAllAccountsView ? ALL_ACCOUNTS_COST_CACHE : INDIVIDUAL_COST_CACHE;
  
  console.log(`[CACHE_STORE] Using ${isAllAccountsView ? 'ALL_ACCOUNTS' : 'INDIVIDUAL'} cache`);
  
  // Store full data in appropriate cache
  dataCache[cacheKey] = {
    timestamp: now,
    payload: data,
    isValid,
    lastValidated: now,
    accountId,
    dateRange: `${startDate}|${endDate}`,
    staleAfter: now + CACHE_CONFIG.backgroundRefresh,
    expires: now + CACHE_CONFIG.fastTTL
  };
  
  // Extract and store cost data separately
  const costData = extractCostData(data);
  const costValid = validateCostData(costData);
  
  if (costValid) {
    costCache[costCacheKey] = {
      timestamp: now,
      payload: costData,
      isValid: true,
      lastValidated: now,
      accountId,
      dateRange: `${startDate}|${endDate}`,
      staleAfter: now + CACHE_CONFIG.backgroundRefresh,
      expires: now + CACHE_CONFIG.costTTL,
      costDataOnly: true
    };
  }
  
  console.log(`[SMART_CACHE] Stored data for ${cacheKey}, cost valid: ${costValid}`);
};

// Background worker functions
const addToBackgroundQueue = (
  accountId: string | null,
  startDate: string,
  endDate: string,
  priority: number = 1
): void => {
  const exists = BACKGROUND_WORKERS.queue.some(
    item => item.accountId === accountId && 
            item.startDate === startDate && 
            item.endDate === endDate
  );
  
  if (!exists) {
    BACKGROUND_WORKERS.queue.push({ accountId, startDate, endDate, priority });
    BACKGROUND_WORKERS.queue.sort((a, b) => b.priority - a.priority); // Higher priority first
    console.log(`[BACKGROUND] Added to queue: ${buildSmartCacheKey(startDate, endDate, accountId)}`);
  }
  
  // Start processing if not already running
  if (!BACKGROUND_WORKERS.isProcessing) {
    processBackgroundQueue();
  }
};

const processBackgroundQueue = async (): Promise<void> => {
  if (BACKGROUND_WORKERS.isProcessing || BACKGROUND_WORKERS.queue.length === 0) {
    return;
  }
  
  BACKGROUND_WORKERS.isProcessing = true;
  console.log(`[BACKGROUND] Starting queue processing, ${BACKGROUND_WORKERS.queue.length} items`);
  
  while (BACKGROUND_WORKERS.queue.length > 0) {
    const item = BACKGROUND_WORKERS.queue.shift();
    if (!item) continue;
    
    const { accountId, startDate, endDate } = item;
    const workerId = buildSmartCacheKey(startDate, endDate, accountId);
    
    // Skip if already processing this item
    if (BACKGROUND_WORKERS.active.has(workerId)) {
      continue;
    }
    
    // Check rate limits before processing
    if (isRateLimited()) {
      console.warn('[BACKGROUND] Rate limited, requeuing item');
      BACKGROUND_WORKERS.queue.unshift(item); // Put back at front
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      continue;
    }
    
    try {
      BACKGROUND_WORKERS.active.add(workerId);
      console.log(`[BACKGROUND] Processing ${workerId}`);
      
      // Record the request for rate limiting
      recordRequest();
      
      // Fetch fresh data
      const freshData = await fetchGoogleAdsData(startDate, endDate);
      
      if (freshData) {
        storeSmartCacheData(startDate, endDate, accountId, freshData, true);
        console.log(`[BACKGROUND] Successfully refreshed ${workerId}`);
      }
      
    } catch (error) {
      console.error(`[BACKGROUND] Error processing ${workerId}:`, error);
      
      // Handle Google Ads specific rate limit errors
      if (handleGoogleAdsRateLimit(error)) {
        BACKGROUND_WORKERS.queue.unshift(item); // Requeue
        break; // Stop processing during cooldown
      }
      
    } finally {
      BACKGROUND_WORKERS.active.delete(workerId);
    }
    
    // Add much longer delay between requests to be ultra conservative
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
  }
  
  BACKGROUND_WORKERS.isProcessing = false;
  console.log('[BACKGROUND] Queue processing completed');
  
  // Schedule next processing cycle if queue is not empty
  if (BACKGROUND_WORKERS.queue.length > 0) {
    setTimeout(() => processBackgroundQueue(), 10000); // Retry in 10 seconds
  }
};

// Public API
export const scheduleBackgroundRefresh = (
  startDate: string,
  endDate: string,
  accountId: string | null,
  priority: number = 1
): void => {
  if (!accountId || accountId === 'all') {
    // For "all accounts" view, schedule refresh for all individual accounts
    // This ensures consistency between individual and aggregated views
    const accountIds = [
      '8677814915', '9071440966', '5723554317', '3146253756', 
      '5857090949', '6201189752', '4071621621', '7579121709',
      '1918795911', '2849704713', '7605096292', '5719842337', 
      '9341614254', '4277350349'
    ];
    
    accountIds.forEach((id, index) => {
      // Stagger the requests to avoid rate limits
      addToBackgroundQueue(id, startDate, endDate, priority - (index * 0.1));
    });
    
    console.log(`[SMART_CACHE] Scheduled background refresh for all ${accountIds.length} individual accounts`);
  } else {
    // For individual account, just schedule that account
    addToBackgroundQueue(accountId, startDate, endDate, priority);
  }
};

export const getRateLimitStatus = () => {
  resetDailyCounter();
  return {
    dailyCount: RATE_LIMITER.dailyCount,
    maxDaily: RATE_LIMIT_CONFIG.maxDailyRequests,
    qpsCount: RATE_LIMITER.requestTimes.length,
    maxQPS: RATE_LIMIT_CONFIG.maxQPS,
    isInCooldown: RATE_LIMITER.isInCooldown,
    cooldownUntil: RATE_LIMITER.cooldownUntil,
    canMakeRequest: !isRateLimited()
  };
};

// Initialize background processing
if (typeof globalThis !== 'undefined') {
  // Start background queue processing every 30 seconds
  setInterval(() => {
    if (!BACKGROUND_WORKERS.isProcessing && BACKGROUND_WORKERS.queue.length > 0) {
      processBackgroundQueue();
    }
  }, 30000);
}
