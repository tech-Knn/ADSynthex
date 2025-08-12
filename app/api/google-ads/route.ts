import { NextRequest, NextResponse } from 'next/server';
import { fetchGoogleAdsData, getMockGoogleAdsData, getQuotaStatus, GoogleAdsAd } from '../../../lib/google-ads-api';
import {
  getSmartCachedData,
  storeSmartCacheData,
  scheduleBackgroundRefresh,
  getRateLimitStatus,
  mergeCostData,
  handleGoogleAdsRateLimit
} from '../../../lib/google-ads-smart-cache';

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
        cost_micros?: number;
      } = {
        impressions: parseInt(ad.metrics.impressions) || 0,
        clicks: parseInt(ad.metrics.clicks) || 0,
        ctr: parseFloat(ad.metrics.ctr) || 0,
        cpc: parseFloat(ad.metrics.cpc) || 0,
        cost: 0, // Will be calculated below
        conversions: parseInt(ad.metrics.conversions) || 0,
        cost_micros: parseInt(ad.metrics.cost_micros) || 0
      };
      
      // Convert cost from micros to dollars if needed
      if (ad.metrics.cost_micros && ad.metrics.cost_micros > 0) {
        metrics.cost = ad.metrics.cost_micros / 1_000_000;
      } else if (ad.metrics.cost) {
        metrics.cost = parseFloat(ad.metrics.cost) || 0;
      }
      
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
    const totalCost = filteredAds.reduce((sum: number, ad: any) => {
      const cost = ad.metrics.cost || 0;
      return sum + cost;
    }, 0);
    
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

// Cache is now managed by the google-ads-cache module

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, customerId } = await request.json();
    console.log(`Google Ads API request for date range: ${startDate} to ${endDate}, Customer ID: ${customerId || 'All'}`);
    console.log('DEBUG: Current time', new Date().toISOString());
    
    // Check smart cache system
    console.log(`[DEBUG] Checking cache for: startDate=${startDate}, endDate=${endDate}, customerId=${customerId}`);
    const { data: cachedData, cacheStatus, shouldRefresh, needsBackgroundRefresh } = getSmartCachedData(startDate, endDate, customerId);
    
    console.log(`[DEBUG] Cache result: status=${cacheStatus}, hasData=${!!cachedData}, shouldRefresh=${shouldRefresh}, needsBackground=${needsBackgroundRefresh}`);
    
    // Schedule background refresh if needed
    if (needsBackgroundRefresh) {
      console.log(`[SMART_CACHE] Scheduling background refresh for account ${customerId || 'all'}`);
      scheduleBackgroundRefresh(startDate, endDate, customerId, 2); // High priority
    }
    
    // If we have valid cached data and don't need immediate refresh, return it
    if (cachedData && !shouldRefresh) {
      console.log(`[SMART_CACHE] Serving from cache: ${cacheStatus}`);
      return NextResponse.json({
        ...cachedData,
        _cacheStatus: cacheStatus,
        _rateLimitStatus: getRateLimitStatus()
      }, {
        headers: {
          'X-Cache': cacheStatus,
          'X-Rate-Limit-Status': JSON.stringify(getRateLimitStatus()),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
    
    // Check rate limits before making any API calls
    const rateLimitStatus = getRateLimitStatus();
    console.log('[SMART_CACHE] Rate limit status:', rateLimitStatus);
    
    if (!rateLimitStatus.canMakeRequest) {
      console.warn('[SMART_CACHE] Rate limited - serving cached data or mock');
      
      if (cachedData) {
        // Serve stale cache if available
        return NextResponse.json({
          ...cachedData,
          _cacheStatus: 'HIT_RATE_LIMITED',
          _rateLimitStatus: rateLimitStatus,
          _message: 'Rate limited - serving cached data'
        }, {
          headers: {
            'X-Cache': 'HIT_RATE_LIMITED',
            'X-Rate-Limit-Status': JSON.stringify(rateLimitStatus),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      } else {
        // Fall back to mock data
        const mockData = getMockGoogleAdsData(startDate, endDate, customerId);
        return NextResponse.json({
          ...mockData,
          _rateLimited: true,
          _rateLimitStatus: rateLimitStatus,
          _message: 'Rate limited - using mock data'
        }, {
          headers: {
            'X-Cache': 'MOCK_RATE_LIMITED',
            'X-Rate-Limit-Status': JSON.stringify(rateLimitStatus),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }
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
      
      // If quota is critically low, always use cache or mock
      if (quotaStatus.remainingRequests <= 2) {
        console.warn('Google Ads API daily quota exceeded, using mock data');
        const mockData = getMockGoogleAdsData(startDate, endDate, customerId);
        
        // Try to get cached data to merge with mock data
        const { data: cachedCostData, cacheStatus: costCacheStatus } = getSmartCachedData(startDate, endDate, customerId);
        
        if (cachedCostData) {
          // We have cached cost data, merge it with mock data
          const mergedData = mergeCostData(mockData, cachedCostData);
          return NextResponse.json({
            ...mergedData,
            _quotaExceeded: true,
            _quotaStatus: quotaStatus,
            _message: 'Daily API quota exceeded. Using mock data with cached costs.',
            _cacheStatus: costCacheStatus
          }, {
            headers: {
              'X-Cache': costCacheStatus,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        }
        
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
      
      // Check if we got any data at all
      if (realData) {
        console.log(`Fetched data from Google Ads API: ${realData.ads?.length || 0} ads, ${realData.campaigns?.length || 0} campaigns`);
        
        // Transform the API data
        const transformedData = transformApiResponse(realData, startDate, endDate, customerId);
        console.log(`Transformed data has ${transformedData.ads?.length || 0} ads`);
        
        // Even if we got zero ads, we still want to cache the response
        // This prevents hammering the API for accounts with no data
        
        // Add quota status to response
        const updatedQuotaStatus = getQuotaStatus();
        
        const responsePayload = {
          ...transformedData,
          _quotaStatus: updatedQuotaStatus,
          _message: 'Real data fetched successfully'
        };

        // Log cost data for debugging
        console.log(`Cost data summary: Total cost: $${transformedData.total_cost}, Ads with cost: ${transformedData.ads.filter((ad: any) => ad.metrics.cost > 0).length}/${transformedData.ads.length}`);
        
        // Store in smart cache system
        storeSmartCacheData(startDate, endDate, customerId, responsePayload, true);

        return NextResponse.json(responsePayload, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
      
      // Don't throw if we got a response, even if it has no ads
      // This prevents hammering the API for accounts with no data
      if (!realData) {
        throw new Error('Empty or invalid response from Google Ads API');
      }
      
      // Use the data we got, even if it has no ads
      const transformedData = transformApiResponse(realData, startDate, endDate, customerId);
      console.log(`Using data with ${transformedData.ads?.length || 0} ads (possibly empty account)`);
      
      // Add quota status to response
      const updatedQuotaStatus = getQuotaStatus();
      
      const responsePayload = {
        ...transformedData,
        _quotaStatus: updatedQuotaStatus,
        _message: 'API returned empty or minimal data (possibly no activity for this period)'
      };

      // Store in smart cache system
      storeSmartCacheData(startDate, endDate, customerId, responsePayload, true);

      return NextResponse.json(responsePayload, {
        headers: {
          'X-Cache': 'MISS',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    } catch (apiErr) {
      console.error('Google Ads API error, falling back to mock:', apiErr);
      
      // Handle Google Ads specific rate limit errors
      if (handleGoogleAdsRateLimit(apiErr)) {
        console.warn('Rate limit detected, serving cached or mock data');
      }
      
      // Get updated quota status
      const quotaStatus = getQuotaStatus();
      
      // Use mock data but adjust based on date range to make it more realistic
      const mockData = getMockGoogleAdsData(startDate, endDate, customerId);
      console.log(`DEBUG: Using mock Google Ads data: ${mockData.campaigns.length} campaigns, ${mockData.ads.length} ads`);
      console.log(`DEBUG: Using mock data with date range ${startDate} to ${endDate}`);
      
      if (customerId) {
        console.log(`DEBUG: Filtered mock data by customer ID ${customerId}`);
      }
      
      // Try to get cached cost data to merge with mock data
      const { data: cachedCostData, cacheStatus: costCacheStatus } = getSmartCachedData(startDate, endDate, customerId);
      
      if (cachedCostData) {
        // We have cached cost data, merge it with mock data
        const mergedData = mergeCostData(mockData, cachedCostData);
        return NextResponse.json({
          ...mergedData,
          _apiError: true,
          _errorMessage: (apiErr as Error).message || 'Unknown API error',
          _quotaStatus: quotaStatus,
          _message: 'API error occurred. Using mock data with cached costs as fallback.',
          _cacheStatus: costCacheStatus
        }, {
          headers: {
            'X-Cache': costCacheStatus,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }
      
      return NextResponse.json({
        ...mockData,
        _apiError: true,
        _errorMessage: (apiErr as Error).message || 'Unknown API error',
        _quotaStatus: quotaStatus,
        _message: 'API error occurred. Using mock data as fallback.'
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
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