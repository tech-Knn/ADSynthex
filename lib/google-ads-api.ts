import fs from 'fs';
import path from 'path';
import { GoogleAdsApi } from 'google-ads-api';
import config from './google-ads-config';
import * as utils from './google-ads-utils';
import { ACCOUNT_FEED_ACCESS, FeedType } from './account-access-control';
import { googleAdsRateLimiter } from './redis-rate-limiter';
import { customer } from 'google-ads-api/build/src/protos/autogen/resourceNames';
import { getMCCForAccount, getDefaultMCC, MCCCredentials } from './mcc-config';

// Target accounts configuration
const TARGET_ACCOUNTS = config.TARGET_ACCOUNTS;

/**
 * Filter accounts by feed type to prevent data mixing between feeds
 * @param feedType - The feed type to filter for ('adscom', 'compado', 'inuvo')
 * @returns Filtered list of accounts belonging to the specified feed
 * EMERGENCY FIX 2026-02-07: Returns empty array if feed is globally disabled
 */
function filterAccountsByFeed(feedType?: FeedType | null): typeof TARGET_ACCOUNTS {
  // If no feed type specified, return all accounts (backward compatibility)
  if (!feedType) {
    return TARGET_ACCOUNTS;
  }

  // EMERGENCY FIX: Check if feed is globally disabled (ads.com, compado, inuvo not in use)
  if (ACCOUNT_FEED_ACCESS && typeof ACCOUNT_FEED_ACCESS === 'object') {
    const disabledFeeds: FeedType[] = ['adscom', 'compado'];
    if (disabledFeeds.includes(feedType)) {
      console.log(`[GOOGLE_ADS_API] ⚠️  Feed ${feedType} is DISABLED (not in use - saving quota)`);
      console.log(`[GOOGLE_ADS_API] Returning 0 accounts for ${feedType} feed (quota saving measure)`);
      return [];
    }
  }

  console.log(`[GOOGLE_ADS_API] Filtering accounts for feed type: ${feedType}`);

  // Filter accounts based on ACCOUNT_FEED_ACCESS mapping
  const filteredAccounts = TARGET_ACCOUNTS.filter(account => {
    const accountKey = `CID_${account.id}`;
    const allowedFeeds = ACCOUNT_FEED_ACCESS[accountKey];

    // Include account if it has access to this feed
    return allowedFeeds && allowedFeeds.includes(feedType);
  });

  console.log(`[GOOGLE_ADS_API] Filtered ${filteredAccounts.length}/${TARGET_ACCOUNTS.length} accounts for ${feedType} feed`);
  console.log(`[GOOGLE_ADS_API] Accounts: ${filteredAccounts.map(a => `${a.name} (${a.id})`).join(', ')}`);

  return filteredAccounts;
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMultiplier: 2,
  maxBackoffDelay: 10000
};

// Helper function to check API quotas and provide detailed error information
function analyzeApiError(error: any): { shouldRetry: boolean; errorType: string; message: string } {
  const errorMessage = error.message || error.toString();

  // Rate limit errors
  if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      shouldRetry: true,
      errorType: 'RATE_LIMIT',
      message: 'API rate limit exceeded. This is normal for high-volume requests.'
    };
  }

  // Quota exceeded errors
  if (errorMessage.includes('quota') || errorMessage.includes('QUOTA_EXCEEDED')) {
    return {
      shouldRetry: false,
      errorType: 'QUOTA_EXCEEDED',
      message: 'Daily API quota exceeded. Please try again tomorrow or contact support.'
    };
  }

  // Authentication errors
  if (errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED') ||
    errorMessage.includes('403') || errorMessage.includes('PERMISSION_DENIED')) {
    return {
      shouldRetry: false,
      errorType: 'AUTHENTICATION',
      message: 'Authentication failed. Please check your API credentials.'
    };
  }

  // Server errors
  if (errorMessage.includes('500') || errorMessage.includes('502') ||
    errorMessage.includes('503') || errorMessage.includes('504')) {
    return {
      shouldRetry: true,
      errorType: 'SERVER_ERROR',
      message: 'Google Ads API server error. This is temporary.'
    };
  }

  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('timeout') ||
    errorMessage.includes('ECONNRESET') || errorMessage.includes('ENOTFOUND')) {
    return {
      shouldRetry: true,
      errorType: 'NETWORK_ERROR',
      message: 'Network connectivity issue. Retrying...'
    };
  }

  // Default case
  return {
    shouldRetry: false,
    errorType: 'UNKNOWN',
    message: `Unknown error: ${errorMessage}`
  };
}

// Helper function to retry with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = RETRY_CONFIG.maxRetries,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      const errorAnalysis = analyzeApiError(error);

      if (attempt < maxRetries && errorAnalysis.shouldRetry) {
        const delay = Math.min(
          baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
          RETRY_CONFIG.maxBackoffDelay
        );

        console.log(`Google Ads API attempt ${attempt + 1} failed: ${errorAnalysis.errorType} - ${errorAnalysis.message}`);
        console.log(`Retrying in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Log final error with detailed information
      console.error(`Google Ads API failed after ${attempt + 1} attempts:`, {
        errorType: errorAnalysis.errorType,
        message: errorAnalysis.message,
        originalError: error.message
      });

      // For quota exceeded, log additional information
      if (errorAnalysis.errorType === 'QUOTA_EXCEEDED') {
        console.error('Quota exceeded details:', {
          resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
      }

      // For other errors or max retries reached, throw the error
      throw error;
    }
  }

  throw lastError!;
}

// Google Ads client initialization with multi-MCC support
export function initializeGoogleAdsClient(customerId?: string | null) {
  try {
    let mccCreds: MCCCredentials;

    if (customerId) {
      const creds = getMCCForAccount(customerId);
      mccCreds = creds || getDefaultMCC();
    } else {
      mccCreds = getDefaultMCC();
    }

    const client = new GoogleAdsApi({
      client_id: mccCreds.googleAds.clientId,
      client_secret: mccCreds.googleAds.clientSecret,
      developer_token: mccCreds.googleAds.developerToken,
    });

    const customer = client.Customer({
      customer_id: mccCreds.mccId,
      refresh_token: mccCreds.googleAds.refreshToken,
      login_customer_id: mccCreds.mccId,
    });

    return { client, customer };
  } catch (error) {
    console.error('[Google Ads API] Client init failed:', error);
    throw error;
  }
}

// Build campaign query without restricting by status so we capture ENABLED, PAUSED, REMOVED etc.
function buildActiveCampaignQuery(startDate: string, endDate: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: start="${startDate}", end="${endDate}"`);
  }

  if (endDate < startDate) {
    throw new Error(`Invalid date range: end date (${endDate}) is before start date (${startDate})`);
  }

  return config.queries.activeCampaignQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build all campaigns query
function buildAllCampaignsQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.allCampaignsQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build active ad query
function buildActiveAdGroupAdQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.activeAdGroupAdQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build all ad query
function buildAllAdGroupAdQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.allAdGroupAdQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build asset group query
function buildAssetGroupQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.assetGroupQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build click view query for GCLID data
function buildClickViewQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.clickViewQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build campaign geo-targeting query
function buildCampaignGeoTargetsQuery() {
  return config.queries.campaignGeoTargetsQuery;
}

// Build geographic view query for revenue by geo
function buildGeographicViewQuery(startDate: string, endDate: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(startDate) || !datePattern.test(endDate)) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, got: start="${startDate}", end="${endDate}"`);
  }

  if (endDate < startDate) {
    throw new Error(`Invalid date range: end date (${endDate}) is before start date (${startDate})`);
  }

  return config.queries.geographicViewQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Fetch geo-targeting data for campaigns
async function fetchCampaignGeoTargets(
  accountCustomer: any,
  account: any
): Promise<Map<string, string[]>> {
  try {
    const geoTargetsQuery = buildCampaignGeoTargetsQuery();
    const response = await accountCustomer.query(geoTargetsQuery);

    // Map campaign_id -> list of geo criterion IDs
    const geoTargetMap = new Map<string, string[]>();

    for (const row of response || []) {
      const campaignId = row.campaign?.id || '';

      // Use criterion_id which is the geo target constant ID
      const criterionId = row.campaign_criterion?.criterion_id || '';

      // Extract geo target constant resource name if available
      const geoResourceName = row.campaign_criterion?.location?.geo_target_constant || '';

      // Parse geo ID from resource name (format: "geoTargetConstants/12345")
      let geoId = criterionId;
      if (!geoId && geoResourceName) {
        const match = geoResourceName.match(/geoTargetConstants\/(\d+)/);
        if (match) {
          geoId = match[1];
        }
      }

      if (campaignId && geoId) {
        if (!geoTargetMap.has(campaignId)) {
          geoTargetMap.set(campaignId, []);
        }

        const geoIdStr = String(geoId);
        if (!geoTargetMap.get(campaignId)!.includes(geoIdStr)) {
          geoTargetMap.get(campaignId)!.push(geoIdStr);
        }
      }
    }

    console.log(`[GOOGLE_ADS_API] Fetched geo-targets for ${geoTargetMap.size} campaigns in account ${account.id}`);
    return geoTargetMap;
  } catch (error: any) {
    // Google Ads API errors have an 'errors' array with the actual error details
    const errorArray = error?.errors || [];
    const firstError = errorArray[0] || {};
    const errorMessage = firstError?.message || firstError?.error_code?.request_error || 'Unknown error';

    console.warn(`[GOOGLE_ADS_API] Failed to fetch geo-targets for account ${account.id}:`, errorMessage);
    if (errorArray.length > 0) {
      console.warn(`  Full error details:`, JSON.stringify(firstError, null, 2));
    }
    return new Map();
  }
}

// Fetch geographic view data (revenue by campaign and geo location)
async function fetchGeographicViewData(
  accountCustomer: any,
  account: any,
  startDate: string,
  endDate: string
): Promise<GoogleAdsGeographicView[]> {
  try {
    const geoViewQuery = buildGeographicViewQuery(startDate, endDate);
    const response = await accountCustomer.query(geoViewQuery);

    const geoViewData: GoogleAdsGeographicView[] = [];

    for (const row of response || []) {
      try {
        const campaignId = row.campaign?.id || 'unknown';
        const campaignName = row.campaign?.name || 'Unknown Campaign';
        const campaignStatus = row.campaign?.status || 'UNKNOWN';
        const geoId = Number(row.geographic_view?.country_criterion_id || 0);
        const date = row.segments?.date || '';

        // Extract metrics
        const conversionsValue = Number(row.metrics?.conversions_value || 0);
        const conversions = Number(row.metrics?.conversions || 0);
        const clicks = Number(row.metrics?.clicks || 0);
        const impressions = Number(row.metrics?.impressions || 0);
        const costMicros = Number(row.metrics?.cost_micros || 0);
        const cost = costMicros / 1000000;

        if (geoId > 0) {
          geoViewData.push({
            customer_id: account.id,
            customer_name: account.name,
            campaign_id: campaignId,
            campaign_name: campaignName,
            campaign_status: campaignStatus,
            geo_id: geoId,
            date: date,
            metrics: {
              conversions_value: conversionsValue,
              conversions: conversions,
              clicks: clicks,
              impressions: impressions,
              cost: cost,
              cost_micros: costMicros
            }
          });
        }
      } catch (error) {
        console.error('[GOOGLE_ADS_API] Error processing geographic view row:', error);
      }
    }

    console.log(`[GOOGLE_ADS_API] Fetched ${geoViewData.length} geographic view records for account ${account.id}`);
    return geoViewData;
  } catch (error: any) {
    const errorArray = error?.errors || [];
    const firstError = errorArray[0] || {};
    const errorMessage = firstError?.message || firstError?.error_code?.request_error || 'Unknown error';

    console.warn(`[GOOGLE_ADS_API] Failed to fetch geographic view data for account ${account.id}:`, errorMessage);
    if (errorArray.length > 0) {
      console.warn(`  Full error details:`, JSON.stringify(firstError, null, 2));
    }
    return [];
  }
}

export interface GoogleAdsCampaign {
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  final_url_suffix: string;
  date?: string; // Optional date field for direct access
  segments?: {   // Optional segments for date-segmented data
    date?: string;
  };
  geo_targets?: string[]; // Location targeting (e.g., ["Vietnam", "Indonesia"])
  metrics: {
    impressions: number;
    clicks: number;
    cost: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
    cpa: number;
    cpc: number;
    average_cost: number;
    average_cpc: number;
    average_cpe: number;
    average_target_cpa: number;
  };
}

export interface GoogleAdsAd {
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  ad_group_id: string;
  ad_group_name: string;
  ad_group_status: string;
  ad_id: string;
  ad_name: string;
  ad_status: string;
  final_urls: string[];
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    cost: number;
    conversions: number;
    conversion_rate?: number;
    ctr: number;
    cpc: number;
    cpa?: number;
  };
}

export interface GoogleAdsClick {
  gclid: string;
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id: string;
  ad_group_name: string;
  date: string;
  click_type: string;
}

export interface GoogleAdsGeographicView {
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  geo_id: number;
  date: string;
  metrics: {
    conversions_value: number;
    conversions: number;
    clicks: number;
    impressions: number;
    cost: number;
    cost_micros: number;
  };
}

export interface GoogleAdsData {
  campaigns: GoogleAdsCampaign[];
  ads: GoogleAdsAd[];
  clicks?: GoogleAdsClick[];
  geographic_views?: GoogleAdsGeographicView[];
  total_cost?: number;
}

// Process campaign data
function processCampaignData(response: any[], account: any): GoogleAdsCampaign[] {
  return response.map(item => {
    try {
      // Extract metrics
      const impressions = Number(item.metrics?.impressions || 0);
      const clicks = Number(item.metrics?.clicks || 0);
      const costMicros = Number(item.metrics?.cost_micros || 0);
      const cost = costMicros / 1000000; // Convert micros to standard currency
      const conversions = Number(item.metrics?.conversions || 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      // Extract additional cost metrics
      const averageCostMicros = Number(item.metrics?.average_cost || 0);
      const averageCost = averageCostMicros / 1000000;

      const averageCpcMicros = Number(item.metrics?.average_cpc || 0);
      const averageCpc = averageCpcMicros / 1000000;

      const averageCpeMicros = Number(item.metrics?.average_cpe || 0);
      const averageCpe = averageCpeMicros / 1000000;

      const averageTargetCpaMicros = Number(item.metrics?.average_target_cpa_micros || 0);
      const averageTargetCpa = averageTargetCpaMicros / 1000000;

      // Extract campaign data
      const campaignId = item.campaign ? item.campaign.id : 'unknown';
      const campaignName = item.campaign ? item.campaign.name : 'Unknown Campaign';
      const campaignStatus = item.campaign && item.campaign.status ? item.campaign.status : 'unknown';
      const finalUrlSuffix = item.campaign && item.campaign.final_url_suffix ? item.campaign.final_url_suffix : '';

      // CRITICAL: Extract date from segments for daily segmentation
      const date = item.segments?.date || null;

      return {
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        final_url_suffix: finalUrlSuffix,
        date: date,
        segments: date ? { date } : undefined,
        metrics: {
          impressions,
          clicks,
          cost,
          cost_micros: costMicros,
          conversions,
          ctr,
          cpa: conversions > 0 ? cost / conversions : 0,
          cpc: clicks > 0 ? cost / clicks : 0,
          average_cost: averageCost,
          average_cpc: averageCpc,
          average_cpe: averageCpe,
          average_target_cpa: averageTargetCpa
        }
      };
    } catch (error) {
      console.error('Error processing campaign data:', error);
      return null;
    }
  }).filter(item => item !== null) as GoogleAdsCampaign[];
}

// Process ad data
function processAdData(response: any[], account: any): GoogleAdsAd[] {
  return response.map(item => {
    try {
      // Extract campaign, ad group, and ad information
      const campaignId = item.campaign ? item.campaign.id : 'unknown';
      const campaignName = item.campaign ? item.campaign.name : 'Unknown Campaign';
      const campaignStatus = item.campaign && item.campaign.status ? item.campaign.status : 'unknown';

      const adGroupId = item.ad_group ? item.ad_group.id : 'unknown';
      const adGroupName = item.ad_group ? item.ad_group.name : 'Unknown Ad Group';
      const adGroupStatus = item.ad_group && item.ad_group.status ? item.ad_group.status : 'unknown';

      const adId = item.ad_group_ad && item.ad_group_ad.ad ? item.ad_group_ad.ad.id : 'unknown';
      const adName = item.ad_group_ad && item.ad_group_ad.ad && item.ad_group_ad.ad.name
        ? item.ad_group_ad.ad.name
        : 'Unknown Ad';
      const adStatus = item.ad_group_ad && item.ad_group_ad.status ? item.ad_group_ad.status : 'unknown';

      const finalUrls = (item.ad_group_ad && item.ad_group_ad.ad && item.ad_group_ad.ad.final_urls)
        ? item.ad_group_ad.ad.final_urls
        : [];

      // Safely access metrics with defaults
      const metrics = item.metrics || {};

      // Extract key metrics
      const impressions = Number(metrics.impressions || 0);
      const clicks = Number(metrics.clicks || 0);
      const costMicros = Number(metrics.cost_micros || 0);
      const cost = costMicros / 1000000; // Convert micros to actual currency
      const conversions = Number(metrics.conversions || 0);

      // Calculate derived metrics
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      const cpa = conversions > 0 ? cost / conversions : 0;

      return {
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        ad_group_id: adGroupId,
        ad_group_name: adGroupName,
        ad_group_status: adGroupStatus,
        ad_id: adId,
        ad_name: adName,
        ad_status: adStatus,
        final_urls: finalUrls,
        metrics: {
          impressions,
          clicks,
          cost_micros: costMicros,
          cost,
          conversions,
          conversion_rate: conversionRate,
          ctr,
          cpc,
          cpa
        }
      };
    } catch (error) {
      console.error('Error processing ad data:', error);
      return null;
    }
  }).filter(item => item !== null) as GoogleAdsAd[];
}

// Process asset group data
function processAssetGroupData(response: any[], account: any): GoogleAdsAd[] {
  return response.map(row => {
    try {
      const campaignId = row.campaign ? row.campaign.id : 'unknown';
      const campaignName = row.campaign ? row.campaign.name : 'Unknown Campaign';
      const campaignStatus = row.campaign && row.campaign.status ? row.campaign.status : 'unknown';

      const assetGroupId = row.asset_group ? row.asset_group.id : 'unknown';
      const assetGroupName = row.asset_group ? row.asset_group.name : 'Unknown Asset Group';
      const assetGroupStatus = row.asset_group && row.asset_group.status ? row.asset_group.status : 'unknown';

      const finalUrls = (row.asset_group && row.asset_group.final_urls) ? row.asset_group.final_urls : [];

      // Metrics
      const metrics = row.metrics || {};
      const impressions = Number(metrics.impressions || 0);
      const clicks = Number(metrics.clicks || 0);
      const costMicros = Number(metrics.cost_micros || 0);
      const cost = costMicros / 1_000_000;
      const conversions = Number(metrics.conversions || 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      return {
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        ad_group_id: `AG_${assetGroupId}`,
        ad_group_name: assetGroupName,
        ad_group_status: assetGroupStatus,
        ad_id: `AG_${assetGroupId}`,
        ad_name: `AssetGroup ${assetGroupName}`,
        ad_status: assetGroupStatus,
        final_urls: finalUrls,
        metrics: {
          impressions,
          clicks,
          cost_micros: costMicros,
          cost,
          conversions,
          ctr,
          cpc: clicks > 0 ? cost / clicks : 0
        }
      };
    } catch (err) {
      console.error('Error processing asset group row:', err);
      return null;
    }
  }).filter(Boolean) as GoogleAdsAd[];
}

// Process click view data to extract GCLIDs
function processClickData(response: any[], account: any): GoogleAdsClick[] {
  // Log the first item structure for debugging
  if (response.length > 0) {
    console.log(`[GOOGLE_ADS_API] Click view data structure (first item):`, {
      click_view: response[0].click_view ? 'exists' : 'missing',
      gclid: response[0].click_view?.gclid?.substring(0, 20) || 'missing',
      campaign_id: response[0].campaign?.id || 'missing',
      ad_group_id: response[0].ad_group?.id || 'missing',
      date: response[0].segments?.date || 'missing'
    });
  }

  return response.map(item => {
    try {
      const gclid = item.click_view?.gclid || '';
      const campaignId = item.campaign?.id || 'unknown';
      const campaignName = item.campaign?.name || 'Unknown Campaign';
      const adGroupId = item.ad_group?.id || 'unknown';
      const adGroupName = item.ad_group?.name || 'Unknown Ad Group';
      const date = item.segments?.date || '';
      const clickType = item.segments?.click_type || 'UNKNOWN';

      // Skip if no GCLID
      if (!gclid) {
        return null;
      }

      return {
        gclid,
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        ad_group_id: adGroupId,
        ad_group_name: adGroupName,
        date,
        click_type: clickType
      };
    } catch (error) {
      console.error('Error processing click data:', error);
      return null;
    }
  }).filter(Boolean) as GoogleAdsClick[];
}

// Fetch all necessary data
// EMERGENCY FIX 2026-02-07: Added includeClickViews parameter to reduce quota usage
// Click view queries are EXPENSIVE (1 per account) and often not needed
export async function fetchGoogleAdsData(
  startDate: string,
  endDate: string,
  specificAccountId?: string | null,
  feedType?: FeedType | null,
  includeClickViews: boolean = false
): Promise<GoogleAdsData> {
  const data: GoogleAdsData = {
    campaigns: [],
    ads: [],
    clicks: [],
    geographic_views: []
  };

  console.log(`[GOOGLE_ADS_API] Fetching data for date range: ${startDate} to ${endDate}${feedType ? ` (feed: ${feedType})` : ''}`);

  // CRITICAL FIX: Filter accounts by feed type FIRST to prevent data mixing
  const feedFilteredAccounts = filterAccountsByFeed(feedType);

  let accountsToProcess = feedFilteredAccounts;
  if (specificAccountId && specificAccountId !== 'all') {
    console.log(`[GOOGLE_ADS_API] Filtering for specific account: ${specificAccountId}`);
    console.log(`[GOOGLE_ADS_API] Available accounts in ${feedType || 'all'} feed: ${feedFilteredAccounts.map(acc => acc.id).join(', ')}`);
    accountsToProcess = feedFilteredAccounts.filter(acc => acc.id === specificAccountId);
    if (accountsToProcess.length === 0) {
      console.warn(`[GOOGLE_ADS_API] Account ${specificAccountId} not found in ${feedType || 'all'} feed`);
      console.warn(`[GOOGLE_ADS_API] Available account IDs: ${feedFilteredAccounts.map(acc => `"${acc.id}"`).join(', ')}`);
      return data; // Return empty data if account not found
    }
    console.log(`[GOOGLE_ADS_API] Found matching account: ${accountsToProcess[0].name}`);
  }

  console.log(`Starting Google Ads API fetch for ${accountsToProcess.length} accounts in ${feedType || 'all'} feed${specificAccountId ? ` (filtered for ${specificAccountId})` : ''}`);
  if (accountsToProcess.length > 0) {
    console.log(`[GOOGLE_ADS_API] Processing accounts: ${accountsToProcess.map(a => a.name).join(', ')}`);
  }

  for (let i = 0; i < accountsToProcess.length; i++) {
    const account = accountsToProcess[i];

    try {
      // Check rate limiter status before processing each account
      const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();
      if (quotaStatus.isInCooldown || !quotaStatus.safeToOperate) {
        console.warn(`[GOOGLE_ADS_API] Stopping processing - API in cooldown or unsafe to operate`);
        console.warn(`[GOOGLE_ADS_API] Cooldown ends: ${quotaStatus.cooldownEnds}, Safe to operate: ${quotaStatus.safeToOperate}`);
        break; // Stop processing remaining accounts
      }

      console.log(`[GOOGLE_ADS_API] Processing account ${i + 1}/${accountsToProcess.length}: ${account.id} (${account.name})`);

      // Get MCC credentials for this account
      const { client, customer: mccCustomer } = initializeGoogleAdsClient(account.id);
      const mccCreds = getMCCForAccount(account.id) || getDefaultMCC();

      // Create account-specific customer with correct MCC credentials
      const accountCustomer = client.Customer({
        customer_id: account.id,
        refresh_token: mccCreds.googleAds.refreshToken,
        login_customer_id: mccCreds.mccId,
      });

      // Helper function to make API calls with rate limiting protection
      const makeApiCall = async (query: string, operationName: string) => {
        // CRITICAL: Check rate limiter before EACH API call
        const rateLimitCheck = await googleAdsRateLimiter.canMakeRequest(account.id);

        if (!rateLimitCheck.allowed) {
          console.warn(`[GOOGLE_ADS_API] Rate limit blocked for ${operationName}: ${rateLimitCheck.reason}`);

          // If we need to wait, wait before throwing error
          if (rateLimitCheck.waitTime && rateLimitCheck.waitTime < 60000) { // Wait max 60 seconds
            console.log(`[GOOGLE_ADS_API] Waiting ${Math.round(rateLimitCheck.waitTime / 1000)}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTime));

            // Re-check after waiting
            const recheckResult = await googleAdsRateLimiter.canMakeRequest(account.id);
            if (!recheckResult.allowed) {
              throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}. Retry in ${Math.round(rateLimitCheck.waitTime / 1000)}s`);
            }
          } else {
            throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}. ${rateLimitCheck.waitTime ? `Retry in ${Math.round(rateLimitCheck.waitTime / 1000)}s` : 'Please retry later'}`);
          }
        }

        return await retryWithBackoff(async () => {
          console.log(`[GOOGLE_ADS_API] Making ${operationName} call for account ${account.id}`);

          // Record the request BEFORE making it
          await googleAdsRateLimiter.recordRequest(account.id);

          try {
            const response = await accountCustomer.query(query);
            console.log(`[GOOGLE_ADS_API] ${operationName} response: ${response?.length || 0} items`);
            return response;
          } catch (error: any) {
            // Handle rate limit errors by recording in Redis
            const errorStr = JSON.stringify(error).toLowerCase();
            if (errorStr.includes('rate') || errorStr.includes('429') || errorStr.includes('resource_exhausted')) {
              console.error(`[GOOGLE_ADS_API] Rate limit error detected in ${operationName}`);
              await googleAdsRateLimiter.handleRateLimitError(error);
            }
            throw error;
          }
        }, RETRY_CONFIG.maxRetries, 1000);
      };

      const activeCampaignQuery = buildActiveCampaignQuery(startDate, endDate);
      const activeCampaignResponse = await makeApiCall(activeCampaignQuery, 'Active Campaigns');
      console.log(`[GOOGLE_ADS_API] Account ${account.id} returned ${activeCampaignResponse?.length || 0} campaigns`);

      if (activeCampaignResponse && activeCampaignResponse.length > 0) {
        const processedCampaigns = processCampaignData(activeCampaignResponse, account);

        // Fetch geo-targeting data for campaigns
        try {
          console.log(`[GOOGLE_ADS_API] Fetching geo-targeting data for ${processedCampaigns.length} campaigns...`);
          const geoTargetMap = await fetchCampaignGeoTargets(accountCustomer, account);

          // Attach geo-targets to campaigns
          for (const campaign of processedCampaigns) {
            const geoTargets = geoTargetMap.get(campaign.campaign_id);
            if (geoTargets && geoTargets.length > 0) {
              campaign.geo_targets = geoTargets;
              console.log(`[GOOGLE_ADS_API] Campaign ${campaign.campaign_id} (${campaign.campaign_name}): ${geoTargets.join(', ')}`);
            }
          }
        } catch (error: any) {
          console.warn(`[GOOGLE_ADS_API] Geo-targeting fetch failed (continuing):`, error.message);
        }

        // Fetch geographic view data (revenue by campaign + geo)
        try {
          console.log(`[GOOGLE_ADS_API] Fetching geographic view data for revenue by geo...`);
          const geoViewData = await fetchGeographicViewData(accountCustomer, account, startDate, endDate);
          if (geoViewData && geoViewData.length > 0) {
            data.geographic_views!.push(...geoViewData);
            console.log(`[GOOGLE_ADS_API] Added ${geoViewData.length} geographic view records`);
          }
        } catch (error: any) {
          console.warn(`[GOOGLE_ADS_API] Geographic view fetch failed (continuing):`, error.message);
        }

        data.campaigns.push(...processedCampaigns);
      }

      // QUOTA OPTIMIZATION: Removed "All Campaigns" query for AFS feed
      // The "Active Campaigns" query already includes ENABLED + PAUSED campaigns
      // The only difference is REMOVED campaigns, which have $0 cost and don't contribute to revenue matching
      // This saves 1 API call per account (33 accounts × 1 = 33 calls saved per sync)
      // For non-AFS feeds, we could add it back if needed, but AFS uses style_id matching from ads
      if (feedType && feedType !== 'adsense') {
        // For other feeds (adscom, compado, inuvo), fetch all campaigns if needed
        try {
          const allCampaignsQuery = buildAllCampaignsQuery(startDate, endDate);
          const allCampaignsResponse = await makeApiCall(allCampaignsQuery, 'All Campaigns');
          if (allCampaignsResponse && allCampaignsResponse.length > 0) {
            const allCampaigns = processCampaignData(allCampaignsResponse, account);

            // Merge campaign lists, prioritizing active campaigns
            // CRITICAL: Use campaign_id + date as key to preserve daily segmentation
            const campaignMap = new Map();

            // First add all campaigns (use campaign_id + date as key)
            for (const campaign of allCampaigns) {
              const date = campaign.segments?.date || campaign.date || 'no_date';
              const key = `${campaign.campaign_id}_${date}`;
              campaignMap.set(key, campaign);
            }

            // Then override with active campaigns (use campaign_id + date as key)
            for (const campaign of data.campaigns) {
              if (campaign.customer_id === account.id) {
                const date = campaign.segments?.date || campaign.date || 'no_date';
                const key = `${campaign.campaign_id}_${date}`;
                campaignMap.set(key, campaign);
              }
            }

            // Update campaigns list
            data.campaigns = data.campaigns.filter(c => c.customer_id !== account.id);
            data.campaigns.push(...Array.from(campaignMap.values()));
          }
        } catch (error) {
          console.warn(`[GOOGLE_ADS_API] All Campaigns query failed (continuing with active campaigns):`, error instanceof Error ? error.message : 'Unknown error');
          // Continue with active campaigns data
        }
      } else {
        console.log(`[GOOGLE_ADS_API] Skipping "All Campaigns" query for ${feedType} feed (quota optimization - saves 1 API call)`);
      }

      // CRITICAL: We MUST fetch ALL ads (including paused/removed), not just active ads.
      // If a campaign is paused today but had cost yesterday, we need its ads to extract the
      // style_id from the URLs. If we only fetch active ads, paused campaigns will have
      // 0 ads and their cost will be dropped because it can't be mapped to a style_id.
      try {
        const allAdQuery = buildAllAdGroupAdQuery(startDate, endDate);
        const allAdResponse = await makeApiCall(allAdQuery, 'All Ads');
        if (allAdResponse && allAdResponse.length > 0) {
          const processedAds = processAdData(allAdResponse, account);
          data.ads.push(...processedAds);
        }
      } catch (error) {
        console.warn(`[GOOGLE_ADS_API] All Ads query failed:`, error instanceof Error ? error.message : 'Unknown error');
      }

      // Fetch Performance Max asset groups (with error handling to not block click queries)
      try {
        const assetGroupQuery = buildAssetGroupQuery(startDate, endDate);
        const assetGroupResponse = await makeApiCall(assetGroupQuery, 'Asset Groups');
        if (assetGroupResponse && assetGroupResponse.length > 0) {
          const assetGroupAds = processAssetGroupData(assetGroupResponse, account);

          // Add asset group ads to the list
          data.ads.push(...assetGroupAds);
        }
      } catch (error) {
        console.warn(`[GOOGLE_ADS_API] Asset Groups query failed (continuing):`, error instanceof Error ? error.message : 'Unknown error');
      }

      // Fetch click_view data (GCLIDs) for feeds that use GCLID matching
      // AFS uses style_id + domain matching (NO GCLID)
      // Compado, Ads.com, Inuvo use GCLID matching
      // EMERGENCY FIX 2026-02-07: Only fetch if explicitly requested OR env var enabled
      // This saves ~301 API calls per fetch (43 accounts × 7 = massive quota savings!)
      const shouldFetchClickViews = includeClickViews || process.env.ENABLE_CLICK_VIEW_QUERIES === 'true';

      if (shouldFetchClickViews && (feedType === 'adscom' || feedType === 'compado' || feedType === 'inuvo')) {
        console.log(`[GOOGLE_ADS_API] Fetching click_view data (GCLIDs) for ${feedType} feed...`);
        try {
          // OPTIMIZATION: Fetch entire date range in ONE query instead of day-by-day
          // This reduces API calls from 7-30 queries to just 1 query (85-97% reduction!)
          // Example: 7-day range = 1 call instead of 7 calls
          //         30-day range = 1 call instead of 30 calls
          const clickViewQuery = buildClickViewQuery(startDate, endDate);
          console.log(`[GOOGLE_ADS_API] Fetching click_view data (GCLIDs) for ${account.name}: ${startDate} to ${endDate}`);

          const clickViewResponse = await makeApiCall(
            clickViewQuery,
            `Click Views (GCLIDs) for ${account.name}`
          );

          if (clickViewResponse && clickViewResponse.length > 0) {
            const clicks = processClickData(clickViewResponse, account);
            if (clicks.length > 0) {
              data.clicks!.push(...clicks);
              console.log(`[GOOGLE_ADS_API] Fetched ${clicks.length} clicks for ${account.name} (${feedType})`);
            }
          } else {
            console.log(`[GOOGLE_ADS_API] No clicks found for ${account.name}`);
          }

        } catch (error: any) {
          console.warn(`[GOOGLE_ADS_API] Click view fetch failed for ${account.name}:`, error?.message || 'Unknown error');
        }
      } else if (!shouldFetchClickViews && (feedType === 'adscom' || feedType === 'compado' || feedType === 'inuvo')) {
        console.log(`[GOOGLE_ADS_API] Skipping click_view data (disabled to save quota - set ENABLE_CLICK_VIEW_QUERIES=true or pass includeClickViews=true to enable)`);
      } else {
        console.log(`[GOOGLE_ADS_API] Skipping click_view data (not needed for ${feedType || 'this'} feed)`);
      }

      // OPTIMIZATION: Removed hardcoded 1000ms delay between accounts
      // The rate limiter at line 596 already enforces 500ms minimum (2 QPS)
      // and has quota monitoring, cooldown, and circuit breaker protection.
      // This saves 20 seconds for 20 accounts (20 × 1s = 20s)
      // Rate limiter will auto-throttle if quota limits are approached

    } catch (error) {
      console.error(`Error fetching data for account ${account.id}:`, error);

      // Continue with other accounts even if one fails
      // This prevents one bad account from breaking the entire fetch
    }
  }

  const clicksMsg = (feedType === 'adscom' || feedType === 'compado' || feedType === 'inuvo') ? `, ${data.clicks?.length || 0} clicks with GCLIDs` : '';
  console.log(`Google Ads API fetch completed for ${feedType || 'all'} feed. Total: ${data.campaigns.length} campaigns, ${data.ads.length} ads${clicksMsg}`);

  return data;
}

// Export quota status for monitoring (now handled by smart cache)
export function getQuotaStatus() {
  return {
    dailyRequestCount: 0, // Now handled by smart cache
    maxRequestsPerDay: 8000,
    remainingRequests: 8000,
    usagePercentage: 0,
    lastRequestTime: new Date().toISOString(),
    resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
}

// Helper function to get base mock data
function getBaseMockData(): GoogleAdsData {
  // Base campaigns
  const baseCampaigns = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 2844,
        clicks: 1234,
        cost: 73.95,
        cost_micros: 73950000,
        conversions: 45,
        ctr: 43.39,
        cpa: 1.64,
        cpc: 0.06,
        average_cost: 0.06,
        average_cpc: 0.06,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '23456789',
      campaign_name: 'Automotive Knowledge Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 144,
        clicks: 574,
        cost: 54.71,
        cost_micros: 54710000,
        conversions: 12,
        ctr: 398.61,
        cpa: 4.56,
        cpc: 0.095,
        average_cost: 0.095,
        average_cpc: 0.095,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 48735,
        clicks: 4813,
        cost: 102.34,
        cost_micros: 102340000,
        conversions: 18,
        ctr: 9.88,
        cpa: 5.69,
        cpc: 0.0213,
        average_cost: 0.0213,
        average_cpc: 0.0213,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '8677814915',
      customer_name: 'Ads.com - RSOC - IST',
      campaign_id: '45678901',
      campaign_name: 'Industrial Crusher Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 2285,
        clicks: 1149,
        cost: 45.60,
        cost_micros: 45600000,
        conversions: 22,
        ctr: 50.28,
        cpa: 2.07,
        cpc: 0.0397,
        average_cost: 0.0397,
        average_cpc: 0.0397,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '4277350349',
      customer_name: 'RSOC - UTC - Ads.com',
      campaign_id: '56789012',
      campaign_name: 'Bioreactors Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 3009,
        clicks: 1182,
        cost: 42.80,
        cost_micros: 42800000,
        conversions: 19,
        ctr: 39.28,
        cpa: 2.25,
        cpc: 0.0362,
        average_cost: 0.0362,
        average_cpc: 0.0362,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '67890123',
      campaign_name: 'Industrial Crusher Machines Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 2556,
        clicks: 1107,
        cost: 39.70,
        cost_micros: 39700000,
        conversions: 17,
        ctr: 43.31,
        cpa: 2.33,
        cpc: 0.0359,
        average_cost: 0.0359,
        average_cpc: 0.0359,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '78901234',
      campaign_name: 'Metal Stamping Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 1383,
        clicks: 762,
        cost: 36.50,
        cost_micros: 36500000,
        conversions: 15,
        ctr: 55.10,
        cpa: 2.43,
        cpc: 0.0479,
        average_cost: 0.0479,
        average_cpc: 0.0479,
        average_cpe: 0,
        average_target_cpa: 0
      }
    }
  ];

  // Base ads
  const baseAds = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag123456',
      ad_group_name: 'Chemical Processing Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad123456',
      ad_name: 'Chemical Processing Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions'],
      metrics: {
        impressions: 2844,
        clicks: 1234,
        cost_micros: 73950000,
        cost: 73.95,
        conversions: 45,
        conversion_rate: 3.65,
        ctr: 43.39,
        cpc: 0.06,
        cpa: 1.64
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '23456789',
      campaign_name: 'Automotive Knowledge Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag234567',
      ad_group_name: 'Automotive Knowledge Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad234567',
      ad_name: 'Automotive Knowledge Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revving-up-your-automotive-knowledge-essential-insights-into-innovation-safety-and-sustainable-choices'],
      metrics: {
        impressions: 144,
        clicks: 574,
        cost_micros: 54710000,
        cost: 54.71,
        conversions: 12,
        conversion_rate: 2.09,
        ctr: 398.61,
        cpc: 0.095,
        cpa: 4.56
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag345678',
      ad_group_name: 'Industrial Packaging Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad345678',
      ad_name: 'Industrial Packaging Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions'],
      metrics: {
        impressions: 48735,
        clicks: 4813,
        cost_micros: 102340000,
        cost: 102.34,
        conversions: 18,
        conversion_rate: 0.37,
        ctr: 9.88,
        cpc: 0.0213,
        cpa: 5.69
      }
    },
    {
      customer_id: '8677814915',
      customer_name: 'Ads.com - RSOC - IST',
      campaign_id: '45678901',
      campaign_name: 'Industrial Crusher Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag456789',
      ad_group_name: 'Industrial Crusher Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad456789',
      ad_name: 'Industrial Crusher Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/industrial-crusher-machines-enhancing-efficiency-in-high-demand-lump-crushing-industry'],
      metrics: {
        impressions: 2285,
        clicks: 1149,
        cost_micros: 45600000,
        cost: 45.60,
        conversions: 22,
        conversion_rate: 1.91,
        ctr: 50.28,
        cpc: 0.0397,
        cpa: 2.07
      }
    },
    {
      customer_id: '4277350349',
      customer_name: 'RSOC - UTC - Ads.com',
      campaign_id: '56789012',
      campaign_name: 'Bioreactors Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag567890',
      ad_group_name: 'Bioreactors Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad567890',
      ad_name: 'Bioreactors Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/exploring-the-world-of-bioreactors-a-vital-tool-in-biotechnology'],
      metrics: {
        impressions: 3009,
        clicks: 1182,
        cost_micros: 42800000,
        cost: 42.80,
        conversions: 19,
        ctr: 39.28,
        cpa: 2.25,
        cpc: 0.0362
      }
    },
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '67890123',
      campaign_name: 'Industrial Crusher Machines Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag678901',
      ad_group_name: 'Industrial Crusher Machines Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad678901',
      ad_name: 'Industrial Crusher Machines Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revolutionizing-the-industry-with-industrial-crusher-machines'],
      metrics: {
        impressions: 2556,
        clicks: 1107,
        cost_micros: 39700000,
        cost: 39.70,
        conversions: 17,
        ctr: 43.31,
        cpc: 0.0359
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '78901234',
      campaign_name: 'Metal Stamping Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag789012',
      ad_group_name: 'Metal Stamping Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad789012',
      ad_name: 'Metal Stamping Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/metal-stamping-machines-for-industrial-precision'],
      metrics: {
        impressions: 1383,
        clicks: 762,
        cost_micros: 36500000,
        cost: 36.50,
        conversions: 15,
        ctr: 55.10,
        cpc: 0.0479
      }
    }
  ];

  // Generate additional data to reach target count of 553
  const targetAdCount = 553;
  const additionalAdsNeeded = targetAdCount - baseAds.length;

  // Generate additional ads
  const additionalAds = generateAdditionalAds(additionalAdsNeeded, baseCampaigns);

  // Combine base ads with additional ads
  const allAds = [...baseAds, ...additionalAds];

  return {
    campaigns: baseCampaigns,
    ads: allAds
  };
}

// For development/testing when API is not available
export function getMockGoogleAdsData(startDate?: string, endDate?: string, customerId?: string | null): GoogleAdsData {
  console.log(`Generating mock Google Ads data for date range: ${startDate || 'default'} to ${endDate || 'default'}${customerId ? `, customer ID: ${customerId}` : ''}`);

  // Get base mock data
  const baseData = getBaseMockData();

  // Filter by customer ID if provided
  let filteredAds = baseData.ads;
  if (customerId) {
    filteredAds = baseData.ads.filter((ad: GoogleAdsAd) => ad.customer_id === customerId);
    console.log(`Filtered ads by customer ID ${customerId}: ${filteredAds.length} of ${baseData.ads.length} ads remain`);
  }

  // Filter out any Taboola data from mock data
  if (filteredAds && filteredAds.length > 0) {
    const originalCount = filteredAds.length;

    // Filter out any ads with 'taboola' in final_urls (case-insensitive)
    filteredAds = filteredAds.filter((ad: GoogleAdsAd) => {
      if (!ad.final_urls || !Array.isArray(ad.final_urls)) return true;

      // Check if any URL contains "taboola"
      const hasTaboolaUrl = ad.final_urls.some(url =>
        url.toLowerCase().includes('taboola')
      );

      // Check if campaign or ad name contains "taboola"
      const hasTaboolaName =
        (ad.campaign_name && ad.campaign_name.toLowerCase().includes('taboola')) ||
        (ad.ad_name && ad.ad_name.toLowerCase().includes('taboola'));

      return !hasTaboolaUrl && !hasTaboolaName;
    });

    if (originalCount !== filteredAds.length) {
      console.log(`Filtered out Taboola ads from mock data: removed ${originalCount - filteredAds.length} ads`);
    }
  }

  // Adjust data based on date range
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate days between dates
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // For single day requests, provide a day-specific variation
    if (daysDiff === 1) {
      console.log(`Generating single-day mock Google Ads data for: ${startDate}`);
      const singleDayData = generateSingleDayMockData(startDate, filteredAds.length);

      // Apply customer ID filter to single day data if needed
      if (customerId) {
        singleDayData.ads = singleDayData.ads.filter((ad: GoogleAdsAd) => ad.customer_id === customerId);
      }

      return singleDayData;
    }

    // For multi-day ranges, adjust the data proportionally
    if (daysDiff > 1) {
      console.log(`Adjusting mock Google Ads data for ${daysDiff}-day range`);

      // Scale up metrics based on daysDiff
      filteredAds = filteredAds.map((ad: GoogleAdsAd, index: number) => {
        const scaleFactor = 0.8 + (deterministicRandom(startDate, index) * 0.4); // Scale factor between 0.8-1.2

        return {
          ...ad,
          metrics: {
            ...ad.metrics,
            impressions: Math.round(ad.metrics.impressions * daysDiff * scaleFactor),
            clicks: Math.round(ad.metrics.clicks * daysDiff * scaleFactor),
            cost_micros: Math.round(ad.metrics.cost_micros * daysDiff * scaleFactor),
            cost: parseFloat((ad.metrics.cost * daysDiff * scaleFactor).toFixed(2)),
            conversions: Math.round(ad.metrics.conversions * daysDiff * scaleFactor),
          }
        };
      });
    }
  }

  // Calculate total cost
  const totalCost = filteredAds.reduce((sum: number, ad: GoogleAdsAd) => sum + ad.metrics.cost, 0);

  return {
    campaigns: baseData.campaigns,
    ads: filteredAds,
    total_cost: totalCost
  };
}

// Helper function to generate additional ads
function generateAdditionalAds(count: number, campaigns: GoogleAdsCampaign[]): GoogleAdsAd[] {
  const ads: GoogleAdsAd[] = [];

  // Templates for ad creation
  const urlPrefixes = [
    'https://www.freshcuesdaily.com/',
    'https://techinsightsweekly.com/',
    'https://innovationspotlight.net/',
    'https://futuretechtoday.com/',
    'https://emergingtrendsreport.org/',
    'https://nextgentechnology.info/',
    'https://digitaltransformationhub.com/'
  ];

  // Topics for generating URLs
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing',
    'digital-transformation',
    'supply-chain-optimization',
    'predictive-maintenance',
    'smart-factories',
    'industrial-iot',
    'augmented-reality',
    'virtual-reality',
    '3d-printing',
    'additive-manufacturing',
    'electric-vehicles',
    'renewable-energy',
    'green-technology',
    'logistics-automation'
  ];

  // Subtopics for url variation
  const subtopics = [
    'market-trends',
    'top-companies',
    'best-practices',
    'future-developments',
    'case-studies',
    'industry-insights',
    'implementation-guide',
    'benefits-challenges',
    'roi-analysis',
    'technology-comparison',
    'expert-advice',
    'research-findings',
    'latest-innovations',
    'practical-applications',
    'success-stories'
  ];

  // Generate the additional ads
  for (let i = 0; i < count; i++) {
    // Select a random campaign as template
    const campaignTemplate = campaigns[Math.floor(Math.random() * campaigns.length)];

    // Generate variation from template
    const variationFactor = 0.5 + Math.random(); // 0.5 to 1.5

    // Generate URL
    const urlPrefix = urlPrefixes[Math.floor(Math.random() * urlPrefixes.length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const subtopic = subtopics[Math.floor(Math.random() * subtopics.length)];
    const urlSuffix = `${topic}-${subtopic}-${i + 8}`;
    const finalUrl = `${urlPrefix}${urlSuffix}`;

    // Calculate metrics based on template with variations
    const impressions = Math.round(campaignTemplate.metrics.impressions * variationFactor);
    const clicks = Math.round(campaignTemplate.metrics.clicks * variationFactor);
    const costMicros = Math.round(campaignTemplate.metrics.cost_micros * variationFactor);
    const cost = parseFloat((campaignTemplate.metrics.cost * variationFactor).toFixed(2));
    const conversions = Math.round(campaignTemplate.metrics.conversions * variationFactor);
    const ctr = parseFloat((impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2));
    const cpc = parseFloat((clicks > 0 ? cost / clicks : 0).toFixed(4));
    const conversionRate = parseFloat((clicks > 0 ? (conversions / clicks) * 100 : 0).toFixed(2));
    const cpa = parseFloat((conversions > 0 ? cost / conversions : 0).toFixed(2));

    // Create the ad
    ads.push({
      customer_id: campaignTemplate.customer_id,
      customer_name: campaignTemplate.customer_name,
      campaign_id: `campaign-${i + 8}`,
      campaign_name: `Campaign for ${topic}`,
      campaign_status: 'ENABLED',
      ad_group_id: `adgroup-${i + 8}`,
      ad_group_name: `Ad Group for ${topic}`,
      ad_group_status: 'ENABLED',
      ad_id: `ad-${i + 8}`,
      ad_name: `Ad for ${topic}`,
      ad_status: 'ENABLED',
      final_urls: [finalUrl],
      metrics: {
        impressions,
        clicks,
        cost_micros: costMicros,
        cost,
        conversions,
        conversion_rate: conversionRate,
        ctr,
        cpc,
        cpa
      }
    });
  }

  return ads;
}

// Deterministic random function based on date and seed
function deterministicRandom(date: string, seed: number): number {
  // Create a hash from date and seed for consistent randomness
  const hash = (date + seed.toString()).split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  // Convert to 0-1 range
  return Math.abs(hash % 1000) / 1000;
}

// Generate mock data for a single day
function generateSingleDayMockData(dateString: string, targetAdCount: number = 553): GoogleAdsData {
  // Calculate a factor based on which day it is (to make data different per day)
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const dateFactor = (day * 0.1) + (month * 0.05);

  // Create a variation of the standard mock data
  const isToday = dateString === new Date().toISOString().split('T')[0];
  const isYesterday = dateString === new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Base factor for the day
  const factor = 0.4 + dateFactor;

  // Today will have slightly higher numbers than yesterday
  const adjustedFactor = isToday ? factor * 1.2 : (isYesterday ? factor * 0.9 : factor);

  console.log(`Mock data for ${dateString} using factor: ${adjustedFactor.toFixed(2)} (deterministic)`);

  // Base campaigns and ads
  const baseCampaigns = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: Math.round(2844 * adjustedFactor),
        clicks: Math.round(1234 * adjustedFactor),
        cost: parseFloat((73.95 * adjustedFactor).toFixed(2)),
        cost_micros: Math.round(73950000 * adjustedFactor),
        conversions: Math.round(45 * adjustedFactor),
        ctr: 43.39,
        cpa: 1.64,
        cpc: 0.06,
        average_cost: 0.06,
        average_cpc: 0.06,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: Math.round(48735 * adjustedFactor),
        clicks: Math.round(4813 * adjustedFactor),
        cost: parseFloat((102.34 * adjustedFactor).toFixed(2)),
        cost_micros: Math.round(102340000 * adjustedFactor),
        conversions: Math.round(18 * adjustedFactor),
        ctr: 9.88,
        cpa: 5.69,
        cpc: 0.0213,
        average_cost: 0.0213,
        average_cpc: 0.0213,
        average_cpe: 0,
        average_target_cpa: 0
      }
    }
  ];

  const baseAds = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag123456',
      ad_group_name: 'Chemical Processing Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad123456',
      ad_name: 'Chemical Processing Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions'],
      metrics: {
        impressions: Math.round(2844 * adjustedFactor),
        clicks: Math.round(1234 * adjustedFactor),
        cost_micros: Math.round(73950000 * adjustedFactor),
        cost: parseFloat((73.95 * adjustedFactor).toFixed(2)),
        conversions: Math.round(45 * adjustedFactor),
        conversion_rate: 3.65,
        ctr: 43.39,
        cpc: 0.06,
        cpa: 1.64
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag345678',
      ad_group_name: 'Industrial Packaging Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad345678',
      ad_name: 'Industrial Packaging Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions'],
      metrics: {
        impressions: Math.round(48735 * adjustedFactor),
        clicks: Math.round(4813 * adjustedFactor),
        cost_micros: Math.round(102340000 * adjustedFactor),
        cost: parseFloat((102.34 * adjustedFactor).toFixed(2)),
        conversions: Math.round(18 * adjustedFactor),
        conversion_rate: 0.37,
        ctr: 9.88,
        cpc: 0.0213,
        cpa: 5.69
      }
    }
  ];

  // Generate additional ads to reach target count
  const additionalAdsNeeded = targetAdCount - baseAds.length;
  console.log(`Generating ${additionalAdsNeeded} additional ads for single day ${dateString}`);

  // Templates for ad creation
  const urlPrefixes = [
    'https://www.freshcuesdaily.com/',
    'https://techinsightsweekly.com/',
    'https://innovationspotlight.net/',
    'https://futuretechtoday.com/',
    'https://emergingtrendsreport.org/'
  ];

  // Topics for generating URLs
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing'
  ];

  // Generate additional ads
  const additionalAds = [];
  for (let i = 0; i < additionalAdsNeeded; i++) {
    // Select a deterministic base ad as template
    const template = baseAds[Math.floor(deterministicRandom(dateString, i * 100) * baseAds.length)];

    // Generate variation from template - now deterministic
    const variationFactor = 0.3 + deterministicRandom(dateString, i) * 0.7; // 0.3 to 1.0

    // Generate URL - now deterministic
    const urlPrefix = urlPrefixes[Math.floor(deterministicRandom(dateString, i * 200) * urlPrefixes.length)];
    const topic = topics[Math.floor(deterministicRandom(dateString, i * 300) * topics.length)];
    const finalUrl = `${urlPrefix}${topic}-article-${i + 3}`;

    // Calculate metrics
    const impressions = Math.round(template.metrics.impressions * variationFactor);
    const clicks = Math.round(template.metrics.clicks * variationFactor);
    const costMicros = Math.round(template.metrics.cost_micros * variationFactor);
    const cost = parseFloat((template.metrics.cost * variationFactor).toFixed(2));
    const conversions = Math.round((template.metrics.conversions || 0) * variationFactor);
    const ctr = parseFloat((impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2));
    const cpc = parseFloat((clicks > 0 ? cost / clicks : 0).toFixed(4));
    const conversionRate = parseFloat((clicks > 0 ? (conversions / clicks) * 100 : 0).toFixed(2));
    const cpa = parseFloat((conversions > 0 ? cost / conversions : 0).toFixed(2));

    // Create new ad
    additionalAds.push({
      customer_id: template.customer_id,
      customer_name: template.customer_name,
      campaign_id: `campaign-${i + 3}`,
      campaign_name: `Campaign for ${topic}`,
      campaign_status: 'ENABLED',
      ad_group_id: `adgroup-${i + 3}`,
      ad_group_name: `Ad Group for ${topic}`,
      ad_group_status: 'ENABLED',
      ad_id: `ad-${i + 3}`,
      ad_name: `Ad for ${topic}`,
      ad_status: 'ENABLED',
      final_urls: [finalUrl],
      metrics: {
        impressions,
        clicks,
        cost_micros: costMicros,
        cost,
        conversions,
        conversion_rate: conversionRate,
        ctr,
        cpc,
        cpa
      }
    });
  }

  return {
    campaigns: baseCampaigns,
    ads: [...baseAds, ...additionalAds]
  };
}