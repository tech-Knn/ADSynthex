/**
 * Enhanced caching system for Google Ads cost data
 * Implements stale-while-revalidate pattern with separate caching for cost metrics
 */
import { fetchGoogleAdsData, getMockGoogleAdsData, getQuotaStatus } from './google-ads-api';

// Cache data structure
export interface CachedGAData {
  timestamp: number;
  payload: any;
  isValid: boolean;
  lastValidated: number;
  costDataOnly?: boolean;
}

// Separate caches for different types of data
const GA_CACHE: Record<string, CachedGAData> = (globalThis as any).__GA_CACHE__ || {};
const COST_CACHE: Record<string, CachedGAData> = (globalThis as any).__COST_CACHE__ || {};

// Initialize global caches
(globalThis as any).__GA_CACHE__ = GA_CACHE;
(globalThis as any).__COST_CACHE__ = COST_CACHE;

// Cache TTL configuration
export const CACHE_TTL_MS = 2 * 60 * 1000;         // 2 minutes for regular data
export const COST_CACHE_TTL_MS = 15 * 60 * 1000;   // 15 minutes for cost data
export const BACKGROUND_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes background refresh

// Track ongoing background refreshes to prevent duplicates
const ongoingRefreshes: Set<string> = new Set();

// Helper to build cache key
export const buildCacheKey = (start: string, end: string, cid: string | null): string => 
  `${start}|${end}|${cid ?? 'all'}`;

// Validate cost data to ensure it's reasonable
export const validateCostData = (data: any): boolean => {
  // Handle null/undefined data gracefully
  if (!data) {
    console.warn('validateCostData: Received null/undefined data');
    return false;
  }
  
  // Allow empty ads array (could be valid for new accounts or date ranges with no activity)
  if (!data.ads) {
    console.warn('validateCostData: Missing ads array');
    return false;
  }
  
  if (!Array.isArray(data.ads)) {
    console.warn('validateCostData: ads is not an array');
    return false;
  }
  
  // Empty array is acceptable - just means no cost for this period
  if (data.ads.length === 0) {
    console.log('validateCostData: Empty ads array, but still valid (zero cost)');
    return true;
  }

  // Check for negative or extremely high costs
  const invalidAds = data.ads.filter((ad: any) => {
    if (!ad || !ad.metrics) return true;
    
    const cost = ad.metrics.cost;
    // Allow zero costs (no spend) and reasonable costs
    return cost === undefined || cost < 0 || cost > 1000000; // $1M is an extreme upper limit
  });

  if (invalidAds.length > 0) {
    console.warn(`validateCostData: Found ${invalidAds.length} ads with invalid cost metrics`);
    // Allow up to 10% of ads to have invalid costs (data quality issue)
    if (invalidAds.length / data.ads.length > 0.10) {
      console.warn(`validateCostData: Too many invalid ads (${invalidAds.length}/${data.ads.length}), rejecting`);
      return false;
    }
  }

  // Check total cost is reasonable - could be zero for periods with no spend
  const totalCost = data.total_cost;
  if (totalCost === undefined) {
    console.warn('validateCostData: Missing total_cost');
    // Calculate it ourselves if missing
    data.total_cost = data.ads.reduce((sum: number, ad: any) => {
      return sum + (ad?.metrics?.cost || 0);
    }, 0);
  } else if (totalCost < 0 || totalCost > 5000000) { // $5M is an extreme upper limit
    console.warn(`validateCostData: Invalid total_cost: ${totalCost}`);
    return false;
  }

  return true;
};

// Extract cost data only from the full response
export const extractCostData = (data: any): any => {
  if (!data) {
    console.warn('extractCostData: Received null/undefined data');
    return null;
  }
  
  if (!data.ads) {
    console.warn('extractCostData: Missing ads array');
    return { total_cost: 0, ads: [] };
  }
  
  if (!Array.isArray(data.ads)) {
    console.warn('extractCostData: ads is not an array');
    return { total_cost: 0, ads: [] };
  }

  try {
    const costData = {
      total_cost: data.total_cost || 0,
      ads: data.ads.map((ad: any) => {
        if (!ad || !ad.metrics) {
          return null;
        }
        
        return {
          customer_id: ad.customer_id || 'unknown',
          campaign_id: ad.campaign_id || 'unknown',
          ad_id: ad.ad_id || 'unknown',
          metrics: {
            cost: ad.metrics.cost || 0,
            cost_micros: ad.metrics.cost_micros || 0,
            cpc: ad.metrics.cpc || 0,
            cpa: ad.metrics.cpa || 0
          }
        };
      }).filter(Boolean) // Remove any null entries
    };

    return costData;
  } catch (error) {
    console.error('Error extracting cost data:', error);
    return { total_cost: 0, ads: [] };
  }
};

// Merge cost data with the rest of the data
export const mergeCostData = (fullData: any, costData: any): any => {
  if (!fullData) {
    console.warn('mergeCostData: Received null/undefined fullData');
    return fullData;
  }
  
  if (!costData || !costData.ads || !Array.isArray(costData.ads) || costData.ads.length === 0) {
    console.log('mergeCostData: No valid cost data to merge');
    return fullData;
  }

  try {
    // Create a map of cost data by ad_id
    const costMap = new Map();
    costData.ads.forEach((ad: any) => {
      if (!ad || !ad.customer_id || !ad.campaign_id || !ad.ad_id) return;
      
      const key = `${ad.customer_id}|${ad.campaign_id}|${ad.ad_id}`;
      costMap.set(key, ad.metrics);
    });

    // Update the full data with cost metrics
    if (fullData && fullData.ads && Array.isArray(fullData.ads)) {
      fullData.ads = fullData.ads.map((ad: any) => {
        if (!ad || !ad.customer_id || !ad.campaign_id || !ad.ad_id || !ad.metrics) {
          return ad;
        }
        
        const key = `${ad.customer_id}|${ad.campaign_id}|${ad.ad_id}`;
        const costMetrics = costMap.get(key);
        
        if (costMetrics) {
          return {
            ...ad,
            metrics: {
              ...ad.metrics,
              cost: costMetrics.cost || ad.metrics.cost || 0,
              cost_micros: costMetrics.cost_micros || ad.metrics.cost_micros || 0,
              cpc: costMetrics.cpc || ad.metrics.cpc || 0,
              cpa: costMetrics.cpa || ad.metrics.cpa || 0
            }
          };
        }
        
        return ad;
      });

      // Update total cost
      if (typeof costData.total_cost === 'number') {
        fullData.total_cost = costData.total_cost;
      } else {
        // Recalculate total cost from ads if needed
        fullData.total_cost = fullData.ads.reduce((sum: number, ad: any) => {
          return sum + (ad?.metrics?.cost || 0);
        }, 0);
      }
    }

    return fullData;
  } catch (error) {
    console.error('Error merging cost data:', error);
    return fullData;
  }
};

// Get data from cache with cost data merging
export const getCachedData = (startDate: string, endDate: string, customerId: string | null): {
  data: any | null;
  cacheStatus: string;
  shouldFetchFresh: boolean;
} => {
  const cacheKey = buildCacheKey(startDate, endDate, customerId);
  const cachedFullData = GA_CACHE[cacheKey];
  const cachedCostData = COST_CACHE[cacheKey];
  
  let shouldFetchFresh = true;
  let responseData = null;
  let cacheStatus = 'MISS';
  
  // Check if we have valid cached cost data
  if (cachedCostData && cachedCostData.isValid && 
      (Date.now() - cachedCostData.timestamp) < COST_CACHE_TTL_MS) {
    
    // We have valid cached cost data
    if (cachedFullData && (Date.now() - cachedFullData.timestamp) < CACHE_TTL_MS) {
      // Both cost and full data are fresh - serve from cache
      responseData = mergeCostData(cachedFullData.payload, cachedCostData.payload);
      shouldFetchFresh = false;
      cacheStatus = 'HIT_FULL';
    } else {
      // Only cost data is fresh, need to fetch other metrics
      shouldFetchFresh = true;
      cacheStatus = 'HIT_COST_ONLY';
    }
    
    // Schedule background refresh if cost data is getting stale
    if ((Date.now() - cachedCostData.timestamp) > BACKGROUND_REFRESH_INTERVAL) {
      console.log(`[CACHE] Cost data is getting stale, scheduling background refresh`);
      setTimeout(() => {
        refreshCostDataInBackground(startDate, endDate, customerId)
          .catch(err => console.error('Background refresh failed:', err));
      }, 100);
    }
  }
  
  return {
    data: responseData,
    cacheStatus,
    shouldFetchFresh
  };
};

// Store data in cache
export const storeCacheData = (
  cacheKey: string, 
  data: any, 
  transformApiResponse: (data: any, startDate?: string, endDate?: string, customerId?: string | null) => any,
  startDate?: string,
  endDate?: string,
  customerId?: string | null
): void => {
  // Transform the API data if needed
  const transformedData = data.ads ? data : transformApiResponse(data, startDate, endDate, customerId);
  
  // Extract cost data for separate caching
  const costData = extractCostData(transformedData);
  const isValidCost = validateCostData(transformedData);
  
  // Store full data in regular cache
  GA_CACHE[cacheKey] = { 
    timestamp: Date.now(), 
    payload: transformedData,
    isValid: true,
    lastValidated: Date.now()
  };
  
  // Store cost data in cost cache if valid
  if (isValidCost) {
    COST_CACHE[cacheKey] = {
      timestamp: Date.now(),
      payload: costData,
      isValid: true,
      lastValidated: Date.now(),
      costDataOnly: true
    };
  } else {
    console.warn('Invalid cost data received, not caching cost metrics');
  }
};

// Background refresh function for cost data
export async function refreshCostDataInBackground(
  startDate: string, 
  endDate: string, 
  customerId: string | null,
  transformApiResponse?: (data: any, startDate?: string, endDate?: string, customerId?: string | null) => any
) {
  const cacheKey = buildCacheKey(startDate, endDate, customerId);
  
  // Prevent duplicate refreshes
  if (ongoingRefreshes.has(cacheKey)) {
    return;
  }
  
  try {
    ongoingRefreshes.add(cacheKey);
    console.log(`[BACKGROUND] Starting cost data refresh for ${cacheKey}`);
    
    // Check quota before making API call
    const quotaStatus = getQuotaStatus();
    if (quotaStatus.remainingRequests <= 5) { // Keep a buffer
      console.warn('[BACKGROUND] Skipping refresh due to low quota:', quotaStatus);
      return;
    }
    
    // Fetch fresh data with retry logic
    let freshData;
    let processedData;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`[BACKGROUND] Fetch attempt ${attempts}/${maxAttempts}`);
        
        // Fetch fresh data
        freshData = await fetchGoogleAdsData(startDate, endDate);
        
        // Check if we got valid data
        if (!freshData || !freshData.ads) {
          throw new Error('Invalid data structure returned from API');
        }
        
        // Transform the data if a transformer function is provided
        if (transformApiResponse) {
          processedData = transformApiResponse(freshData, startDate, endDate, customerId);
        } else {
          processedData = freshData;
        }
        
        // If we got here, we have valid data
        break;
      } catch (err) {
        console.warn(`[BACKGROUND] Fetch attempt ${attempts} failed:`, err);
        
        if (attempts >= maxAttempts) {
          throw err; // Re-throw after max attempts
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`[BACKGROUND] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // Extract cost data
    const costData = extractCostData(processedData);
    
    // Validate the cost data
    const isValid = validateCostData(processedData);
    
    if (isValid) {
      // Update the cost cache
      COST_CACHE[cacheKey] = {
        timestamp: Date.now(),
        payload: costData,
        isValid: true,
        lastValidated: Date.now(),
        costDataOnly: true
      };
      
      console.log(`[BACKGROUND] Successfully refreshed cost data for ${cacheKey}`);
    } else {
      console.warn(`[BACKGROUND] Invalid cost data received for ${cacheKey}, not updating cache`);
      
      // Store the data anyway but mark as invalid if this is our first attempt
      // This allows us to have some data rather than none
      if (!COST_CACHE[cacheKey]) {
        COST_CACHE[cacheKey] = {
          timestamp: Date.now(),
          payload: costData,
          isValid: false, // Mark as invalid
          lastValidated: Date.now(),
          costDataOnly: true
        };
        console.log(`[BACKGROUND] Stored invalid cost data as fallback`);
      }
    }
  } catch (error) {
    console.error(`[BACKGROUND] Error refreshing cost data:`, error);
  } finally {
    ongoingRefreshes.delete(cacheKey);
  }
}
