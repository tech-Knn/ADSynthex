import fs from 'fs';
import path from 'path';
import { GoogleAdsApi } from 'google-ads-api';
import config from './google-ads-config';
import * as utils from './google-ads-utils';
import { ACCOUNT_FEED_ACCESS, FeedType } from './account-access-control';
import { googleAdsRateLimiter } from './redis-rate-limiter';
import { customer } from 'google-ads-api/build/src/protos/autogen/resourceNames';
import { getMCCForAccount, getDefaultMCC, MCCCredentials } from './mcc-config';
import { getGoogleAdsAccessToken } from './google-ads-token-cache';

// Target accounts configuration
const TARGET_ACCOUNTS = config.TARGET_ACCOUNTS;

/**
 * Filter accounts by feed type to prevent data mixing between feeds
 * @param feedType - The feed type to filter for ('adscom', 'compado', 'inuvo')
 * @returns Filtered list of accounts belonging to the specified feed
 * EMERGENCY FIX 2026-02-07: Returns empty array if feed is globally disabled
 */
export function filterAccountsByFeed(feedType?: FeedType | null): typeof TARGET_ACCOUNTS {
  // If no feed type specified, return all accounts (backward compatibility)
  if (!feedType) {
    return TARGET_ACCOUNTS;
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

  // Network errors — these are TRANSIENT, retry them. Includes the OAuth-token-
  // endpoint premature-close errors that have been killing fetches today.
  const lowerMsg = errorMessage.toLowerCase();
  if (
    lowerMsg.includes('network') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('eai_again') ||
    lowerMsg.includes('socket hang up') ||
    lowerMsg.includes('premature close') ||
    lowerMsg.includes('err_stream_premature_close') ||
    lowerMsg.includes('invalid response body')
  ) {
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
// Memoize one GoogleAdsApi client per MCC and one Customer per account so we
// stop creating fresh OAuth contexts on every fetch. Each Customer's underlying
// auth caches its access token for ~1 hour; previously we threw it away every
// call, which meant 18 concurrent OAuth refreshes hitting oauth2.googleapis.com
// in parallel — that's what was producing the "Premature close" errors on Render.
const __apiClientByMcc: Map<string, any> = new Map();
const __customerByAccount: Map<string, any> = new Map();

/**
 * Get (or create + cache) the GoogleAdsApi client for an MCC.
 * Reused across all accounts that share the same MCC.
 */
function getOrCreateApiClient(mccCreds: MCCCredentials): any {
  const key = mccCreds.mccId;
  const cached = __apiClientByMcc.get(key);
  if (cached) return cached;
  const client = new GoogleAdsApi({
    client_id: mccCreds.googleAds.clientId,
    client_secret: mccCreds.googleAds.clientSecret,
    developer_token: mccCreds.googleAds.developerToken,
  });
  __apiClientByMcc.set(key, client);
  return client;
}

/**
 * Get (or create + cache) the Customer instance for a specific account.
 *
 * Critical override: the google-ads-api library's default getAccessToken() uses
 * google-auth-library, which fetches https://oauth2.googleapis.com/token directly.
 * From Render that fetch is unreliable and produces the "Premature close" errors
 * we kept seeing. We swap getAccessToken with our own Redis-cached, raw-HTTP
 * implementation so:
 *   - Token is shared across processes via Redis (no thundering herd at refresh)
 *   - Raw fetch with retries handles the flaky Render → Google OAuth network
 *   - In-process + Redis caching means the OAuth endpoint is hit ~once/hour total
 */
function getOrCreateCustomer(accountId: string, mccCreds: MCCCredentials): any {
  const key = `${mccCreds.mccId}:${accountId}`;
  const cached = __customerByAccount.get(key);
  if (cached) return cached;
  const client = getOrCreateApiClient(mccCreds);
  const customer = client.Customer({
    customer_id: accountId,
    refresh_token: mccCreds.googleAds.refreshToken,
    login_customer_id: mccCreds.mccId,
  });
  // Replace the library's OAuth path with our Redis-cached raw-HTTP one.
  // The library calls getAccessToken() before every REST call; this override
  // makes that lookup a fast Redis read in steady state.
  customer.getAccessToken = async () => getGoogleAdsAccessToken(mccCreds);
  __customerByAccount.set(key, customer);
  return customer;
}

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



// Country mapping — campaign_criterion se geo_id, phir geo_countries table se code
export async function fetchCampaignCountries(
  specificAccountId: string,
  startDate: string,
  endDate: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>(); // campaignId → geoId (country_criterion_id)
  const costByCampaignCountry = new Map<string, { geoId: string; cost: number }>();
  try {
    const mccCreds = getMCCForAccount(specificAccountId) || getDefaultMCC();
    const customer = getOrCreateCustomer(specificAccountId, mccCreds);
    const rows = await customer.query(`
      SELECT campaign.id, geographic_view.country_criterion_id, metrics.cost_micros
      FROM geographic_view
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `);
    // ek campaign multiple country mein ho to sabse zyada cost wala country lo
    for (const r of rows) {
      const campId = String((r as any).campaign?.id || '');
      const geoId = String((r as any).geographic_view?.country_criterion_id || '');
      const cost = Number((r as any).metrics?.cost_micros || 0);
      if (!campId || !geoId) continue;
      const existing = costByCampaignCountry.get(campId);
      if (!existing || cost > existing.cost) {
        costByCampaignCountry.set(campId, { geoId, cost });
      }
    }
    for (const [campId, v] of costByCampaignCountry) {
      result.set(campId, v.geoId);
    }
    console.log(`[GADS_COUNTRY] ${specificAccountId}: ${result.size} campaigns mapped (geographic_view)`);
  } catch (e: any) {
    console.warn(`[GADS_COUNTRY] ${specificAccountId} failed: ${e?.message}`);
  }
  return result; // campaignId → geoId
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

      // Get MCC credentials and the cached customer for this account.
      // The Customer instance is memoized, so the underlying OAuth context (and
      // its cached access token) survives across dashboard refreshes — no more
      // 18 concurrent token refreshes per fetch.
      const mccCreds = getMCCForAccount(account.id) || getDefaultMCC();
      const accountCustomer = getOrCreateCustomer(account.id, mccCreds);

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

          try {
            const response = await accountCustomer.query(query);
            // Only record AFTER a successful query so failed OAuth refreshes /
            // transient network errors no longer burn through the daily quota.
            // Each failed retry used to count, multiplying real usage 4-8x.
            await googleAdsRateLimiter.recordRequest(account.id);
            console.log(`[GOOGLE_ADS_API] ${operationName} response: ${response?.length || 0} items`);
            return response;
          } catch (error: any) {
            const errorStr = JSON.stringify(error).toLowerCase();
            // Exclude transient network errors (OAuth premature close, socket
            // resets, DNS hiccups). These are NOT rate limits — they're upstream
            // connection blips and shouldn't trigger our cooldown.
            const isTransientNetwork =
              errorStr.includes('err_stream_premature_close') ||
              errorStr.includes('premature close') ||
              errorStr.includes('econnreset') ||
              errorStr.includes('etimedout') ||
              errorStr.includes('socket hang up') ||
              errorStr.includes('eai_again') ||
              errorStr.includes('enotfound') ||
              errorStr.includes('econnrefused');
            // Also tightened the rate-limit pattern — was matching ANY occurrence
            // of "rate" (which appears in retryDelayMultiplier etc.), now requires
            // an actual rate-limit phrase.
            const looksLikeRateLimit = !isTransientNetwork && (
              errorStr.includes('rate limit') ||
              errorStr.includes('too many requests') ||
              errorStr.includes('429') ||
              errorStr.includes('resource_exhausted')
            );
            if (looksLikeRateLimit) {
              console.error(`[GOOGLE_ADS_API] Rate limit error detected in ${operationName}`);
              await googleAdsRateLimiter.handleRateLimitError(error);
            } else if (isTransientNetwork) {
              console.warn(`[GOOGLE_ADS_API] Transient network error in ${operationName} (not a rate limit, no cooldown): ${error?.code || error?.message?.substring(0, 100)}`);
            }
            throw error;
          }
        }, RETRY_CONFIG.maxRetries, 1000);
      };

      // Run the four per-account queries SEQUENTIALLY rather than Promise.all.
      // Parallel fan-out bursts 4 calls/account against Google in the same tick;
      // with batched accounts at the route layer that becomes 16 simultaneous calls,
      // which trips Google's per-MCC rate limit and triggers a long cooldown.
      // Sequential keeps the at-most-in-flight count equal to the batch size, at the
      // cost of ~1× more per-account wall time. Net latency improves in practice
      // because we stop incurring cooldown waits and retry cycles.
      const activeCampaignQuery = buildActiveCampaignQuery(startDate, endDate);
      const allAdQuery = buildAllAdGroupAdQuery(startDate, endDate);
      const assetGroupQuery = buildAssetGroupQuery(startDate, endDate);

      const activeCampaignResponse = await makeApiCall(activeCampaignQuery, 'Active Campaigns').catch((err: any) => {
        console.warn(`[GOOGLE_ADS_API] Campaigns query failed for ${account.id}:`, err?.message);
        return null;
      });
      const geoTargetMap = await fetchCampaignGeoTargets(accountCustomer, account).catch((err: any) => {
        console.warn(`[GOOGLE_ADS_API] Geo-targeting failed for ${account.id}:`, err?.message);
        return new Map<string, string[]>();
      });
      const allAdResponse = await makeApiCall(allAdQuery, 'All Ads').catch((err: any) => {
        console.warn(`[GOOGLE_ADS_API] Ads query failed for ${account.id}:`, err?.message);
        return null;
      });
      const assetGroupResponse = await makeApiCall(assetGroupQuery, 'Asset Groups').catch((err: any) => {
        console.warn(`[GOOGLE_ADS_API] Asset groups query failed for ${account.id}:`, err?.message);
        return null;
      });

      console.log(`[GOOGLE_ADS_API] Account ${account.id}: ${activeCampaignResponse?.length || 0} campaigns, ${allAdResponse?.length || 0} ads, ${assetGroupResponse?.length || 0} asset groups`);

      // Refuse to return campaigns without ads. final_urls (and the channel_id/style_id
      // inside them) only come from ads — if ads failed while campaigns succeeded, the
      // upstream allocator sees cost with no revenue and shows -100% ROI. Throw fast so
      // the route's per-account retry refetches this account with priority 10 instead of
      // caching a broken payload.
      const adsFailed = allAdResponse === null;
      const campaignsFailed = activeCampaignResponse === null;
      const hasCampaigns = !!(activeCampaignResponse && activeCampaignResponse.length > 0);
      const hasAds = !!(allAdResponse && allAdResponse.length > 0);
      const isCostAttributionFeed = feedType === 'androidadvice'

      if (adsFailed && hasCampaigns && isCostAttributionFeed) {
        throw new Error(`Ads query failed for ${account.id} on ${feedType} feed (campaigns: ${activeCampaignResponse.length}) — abort account to trigger retry`);
      }

      // Symmetric guard: if the CAMPAIGNS query silently returned null while the ADS
      // query succeeded, the account would pass through with ads but no campaigns/cost.
      // route.ts treats `result.data.campaigns || result.data.ads` as success (and `[]`
      // is truthy in JS), so without this throw the user sees ads/revenue but $0 cost
      // for the account — the exact jitter that showed up in AndroidAdvice screenshots
      // where the same account's cost flipped between a real number and $0 across
      // refreshes. Throw to force the retry path.
      if (campaignsFailed && hasAds && isCostAttributionFeed) {
        throw new Error(`Campaigns query failed for ${account.id} on ${feedType} feed (ads: ${allAdResponse.length}) — abort account to trigger retry`);
      }

      // Process campaigns and attach geo targets
      if (activeCampaignResponse && activeCampaignResponse.length > 0) {
        const processedCampaigns = processCampaignData(activeCampaignResponse, account);

        for (const campaign of processedCampaigns) {
          const geoTargets = (geoTargetMap as Map<string, string[]>).get(campaign.campaign_id);
          if (geoTargets && geoTargets.length > 0) {
            campaign.geo_targets = geoTargets;
          }
        }

        data.campaigns.push(...processedCampaigns);
      }

      // For non-AFS-style feeds, merge "All Campaigns" (includes REMOVED) into the data.
      // AFS-style feeds (adsense, carhp, thefactrelay, androidadvice) use style_id
      // matching which ignores REMOVED campaigns, so this query is pure overhead — 1
      // wasted call per account per fetch. Skipping it on androidadvice alone saves
      // 18 calls per dashboard load (~25% of androidadvice's GAds quota burn).
      const AFS_STYLE_FEEDS = new Set(['androidadvice']);
      if (feedType && !AFS_STYLE_FEEDS.has(feedType)) {
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
      }

      // Process ads (needed for style_id extraction)
      if (allAdResponse && allAdResponse.length > 0) {
        const processedAds = processAdData(allAdResponse, account);
        data.ads.push(...processedAds);
      }

      // Process asset groups
      if (assetGroupResponse && assetGroupResponse.length > 0) {
        const assetGroupAds = processAssetGroupData(assetGroupResponse, account);
        data.ads.push(...assetGroupAds);
      }

      // Fetch click_view data (GCLIDs) for feeds that use GCLID matching
      // AFS uses style_id + domain matching (NO GCLID)
      // Compado, Ads.com, Inuvo use GCLID matching
      // EMERGENCY FIX 2026-02-07: Only fetch if explicitly requested OR env var enabled
      // This saves ~301 API calls per fetch (43 accounts × 7 = massive quota savings!)
      const shouldFetchClickViews = includeClickViews || process.env.ENABLE_CLICK_VIEW_QUERIES === 'true';

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
  return data;
}

// ============================================================================
// SYNC ke liye 2-query fetch: ad_group_ad (normal) + asset_group (PMax).
// campaign + geo query DROP. Cost per-date synthesize hoti hai. DB-driven (no silent-skip).
// ============================================================================
export async function fetchGoogleAdsDataForSync(
  startDate: string,
  endDate: string,
  specificAccountId?: string | null,
  feedType?: FeedType | null
): Promise<GoogleAdsData> {
  const data: GoogleAdsData = { campaigns: [], ads: [], clicks: [], geographic_views: [] };
  console.log(`[GADS_SYNC] 2-query fetch: ${startDate} to ${endDate} (feed: ${feedType})`);

  // DB-driven: sync exact cid DB se bhejta hai — seedhe use karo, koi hardcoded filter nahi.
  // YEHI silent-skip fix: DB ka koi bhi account (account 20 included) ab sync hoga.
  const accountsToProcess = (specificAccountId && specificAccountId !== 'all')
    ? [{ id: specificAccountId, name: `androidadvice ${specificAccountId}` }]
    : filterAccountsByFeed(feedType);

  for (const account of accountsToProcess) {
    try {
      const mccCreds = getMCCForAccount(account.id) || getDefaultMCC();
      const customer = getOrCreateCustomer(account.id, mccCreds);
      const adQuery = buildAllAdGroupAdQuery(startDate, endDate);
      const assetQuery = buildAssetGroupQuery(startDate, endDate);

      const guardedQuery = async (q: string, name: string) => {
        const chk = await googleAdsRateLimiter.canMakeRequest(account.id);
        if (!chk.allowed) {
          if (chk.waitTime && chk.waitTime < 60000) await new Promise(r => setTimeout(r, chk.waitTime));
          else throw new Error(`Rate limit: ${chk.reason}`);
        }
        const resp = await customer.query(q);
        await googleAdsRateLimiter.recordRequest(account.id);
        console.log(`[GADS_SYNC] ${account.id} ${name}: ${resp?.length || 0} rows`);
        return resp;
      };

      const adResp = await guardedQuery(adQuery, 'ad_group_ad').catch((e: any) => {
        console.warn(`[GADS_SYNC] ad_group_ad failed ${account.id}: ${e?.message}`); return null;
      });
      const assetResp = await guardedQuery(assetQuery, 'asset_group').catch((e: any) => {
        console.warn(`[GADS_SYNC] asset_group failed ${account.id}: ${e?.message}`); return null;
      });

      // SILENT-FAIL GUARD: dono null = quota/auth fail → throw, $0 na likhe, retry ho.
      if (adResp === null && assetResp === null) {
        throw new Error(`Both ad_group_ad & asset_group failed for ${account.id} — likely quota/auth`);
      }

      // cost by (campaign_id, date) — dono responses se aggregate
      const costMap = new Map<string, { campaignId: string; campaignName: string; date: string; cost: number; clicks: number; impressions: number; conversions: number; }>();
      const addRows = (rows: any[] | null) => {
        for (const r of rows || []) {
          const campaignId = String(r.campaign?.id || 'unknown');
          const date = r.segments?.date || '';
          if (!date) continue;
          const key = `${campaignId}|${date}`;
          const m = r.metrics || {};
          let e = costMap.get(key);
          if (!e) { e = { campaignId, campaignName: r.campaign?.name || '', date, cost: 0, clicks: 0, impressions: 0, conversions: 0 }; costMap.set(key, e); }
          e.cost += Number(m.cost_micros || 0);
          e.clicks += Number(m.clicks || 0);
          e.impressions += Number(m.impressions || 0);
          e.conversions += Number(m.conversions || 0);
        }
      };
      addRows(adResp); addRows(assetResp);

      for (const e of costMap.values()) {
        data.campaigns.push({
          customer_id: account.id, customer_name: account.name,
          campaign_id: e.campaignId, campaign_name: e.campaignName,
          campaign_status: 'ENABLED', final_url_suffix: '',
          date: e.date, segments: { date: e.date },
          metrics: {
            impressions: e.impressions, clicks: e.clicks,
            cost: e.cost / 1e6, cost_micros: e.cost, conversions: e.conversions,
            ctr: 0, cpa: 0, cpc: 0, average_cost: 0, average_cpc: 0, average_cpe: 0, average_target_cpa: 0,
          },
        } as GoogleAdsCampaign);
      }

      if (adResp && adResp.length > 0) data.ads.push(...processAdData(adResp, account));
      if (assetResp && assetResp.length > 0) data.ads.push(...processAssetGroupData(assetResp, account));

      await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.error(`[GADS_SYNC] Account ${account.id} error: ${err?.message || err}`);
      throw err;
    }
  }
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
