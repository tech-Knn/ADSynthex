import axios, { AxiosInstance } from 'axios';
import { getEurToUsdRate } from './currency-service';

const compadoClient: AxiosInstance = axios.create({
  baseURL: process.env.COMPADO_API_URL || 'https://api.compado.com',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
});

export async function convertEurToUsd(amountEur: number): Promise<number> {
  const rate = await getEurToUsdRate();
  return parseFloat((amountEur * rate).toFixed(2));
}

export async function getExchangeRate(): Promise<number> {
  return getEurToUsdRate();
}

// TypeScript Interfaces
export interface CompadoConversion {
  srcclkid: string;
  campaign_id: string;
  gclid: string;
  revenue: number; // Revenue in EUR (from Compado API)
  revenueUsd?: number; // Revenue converted to USD (calculated)
  timestamp: string;
  conversion_type?: string;
  device?: string;
  country?: string;
  ad_id?: string;
  traffic_source?: string;
  keywords?: string[];
  estimated_clicks?: number;
}

export interface CompadoApiResponse {
  status: string;
  page_count: number;
  page: number;
  click_ids: Array<{
    click_id: string;
    ad_id: string;
    click_created_at: string;
    traffic_source: string;
    keywords?: string[];
    estimated_clicks?: number;
    estimated_earnings: number;
  }>;
}

export interface CompadoDailySummary {
  date: string;
  total_conversions: number;
  total_revenue: number;
  unique_campaigns: number;
  average_revenue_per_conversion: number;
}

export interface CompadoFetchParams {
  start_date: string;
  end_date: string;
  page?: number;
  per_page?: number;
}

// Fetch conversions from Compado API
export async function fetchCompadoConversions(
  params: CompadoFetchParams
): Promise<CompadoApiResponse> {
  try {
    const { start_date, end_date, page = 1, per_page = 100 } = params;

    const response = await compadoClient.get('/adsense/clickid-report', {
      params: {
        user: process.env.COMPADO_API_USER,
        password: process.env.COMPADO_API_PASSWORD,
        start_date,
        end_date,
        page,
        per_page
      }
    });

    console.log(`[COMPADO_API] Raw response: ${response.data.click_ids?.length || 0} clicks, page ${response.data.page}/${response.data.page_count}`);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Compado API Error:', {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
      throw new Error(`Compado API request failed: ${error.message}`);
    }
    throw error;
  }
}

export async function fetchAllCompadoConversions(
  start_date: string,
  end_date: string
): Promise<CompadoConversion[]> {
  try {
    // PERFORMANCE OPTIMIZATION: Check cache first
    const { redisCacheManager } = await import('./redis-cache-manager');
    const cacheKey = redisCacheManager.generateKey({
      dataType: 'compado',
      accountId: 'all',
      startDate: start_date,
      endDate: end_date,
      extra: 'conversions'
    });

    // Try to get from cache
    const cached = await redisCacheManager.get(cacheKey, { dataType: 'compado' });
    if (cached.data) {
      console.log(`[COMPADO_API] ✓ Cache hit! Using cached conversions (age: ${Math.round(cached.age / 1000)}s)`);
      return cached.data;
    }

    console.log('[COMPADO_API] Cache miss - Fetching conversions from API with NEW format...');
    const allConversions: CompadoConversion[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    const exchangeRate = await getExchangeRate();
    const exchangeRateDate = new Date().toISOString();
    console.log(`[COMPADO_API] ==================== EXCHANGE RATE INFO ====================`);
    console.log(`[COMPADO_API] Exchange rate (EUR → USD): ${exchangeRate}`);
    console.log(`[COMPADO_API] Fetched at: ${exchangeRateDate}`);
    console.log(`[COMPADO_API] Date range: ${start_date} to ${end_date}`);
    console.log(`[COMPADO_API] ===========================================================`);

    while (hasMorePages) {
      const response = await fetchCompadoConversions({
        start_date,
        end_date,
        page: currentPage,
        per_page: 100
      });

      // Transform the new API response format to our internal format
      const conversionsWithUsd = (response.click_ids || []).map(click => {
        // Extract GCLID - handle {gclid} placeholder and actual GCLIDs
        const gclid = click.click_id === '{gclid}' ? 'placeholder_gclid' : click.click_id;

        // Use ad_id as campaign_id since we don't have campaign info
        const campaign_id = click.ad_id || 'unknown';

        const revenueEur = click.estimated_earnings || 0;
        const revenueUsd = parseFloat((revenueEur * exchangeRate).toFixed(2));

        return {
          srcclkid: `${gclid}_${campaign_id}`,
          campaign_id: campaign_id,
          gclid: gclid,
          revenue: revenueEur,
          revenueUsd: revenueUsd,
          timestamp: click.click_created_at || new Date().toISOString(),
          ad_id: click.ad_id,
          traffic_source: click.traffic_source,
          keywords: click.keywords,
          estimated_clicks: click.estimated_clicks
        };
      });

      allConversions.push(...conversionsWithUsd);
      hasMorePages = currentPage < response.page_count;
      currentPage++;
    }

    const totalRevenueEur = allConversions.reduce((sum, c) => sum + c.revenue, 0);
    const totalRevenueUsd = allConversions.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);

    // Check for data quality issues
    const placeholderGclids = allConversions.filter(c => c.gclid === 'placeholder_gclid' || c.gclid === '{gclid}');
    const emptyGclids = allConversions.filter(c => !c.gclid || c.gclid.trim() === '');
    const shortGclids = allConversions.filter(c => c.gclid && c.gclid.length < 10 && c.gclid !== 'placeholder_gclid');

    console.log(`[COMPADO_API] ${allConversions.length} conversions: €${totalRevenueEur.toFixed(2)} → $${totalRevenueUsd.toFixed(2)} (rate: ${exchangeRate})`);

    if (placeholderGclids.length > 0 || emptyGclids.length > 0 || shortGclids.length > 0) {
      console.log(`[COMPADO_API] Data Quality Issues Detected:`);
      if (placeholderGclids.length > 0) {
        const placeholderRevenue = placeholderGclids.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);
        console.log(`[COMPADO_API]    - ${placeholderGclids.length} conversions with placeholder GCLIDs (€${placeholderGclids.reduce((s, c) => s + c.revenue, 0).toFixed(2)} / $${placeholderRevenue.toFixed(2)})`);
      }
      if (emptyGclids.length > 0) {
        const emptyRevenue = emptyGclids.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);
        console.log(`[COMPADO_API]    - ${emptyGclids.length} conversions with empty GCLIDs (€${emptyGclids.reduce((s, c) => s + c.revenue, 0).toFixed(2)} / $${emptyRevenue.toFixed(2)})`);
      }
      if (shortGclids.length > 0) {
        const shortRevenue = shortGclids.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);
        console.log(`[COMPADO_API]    - ${shortGclids.length} conversions with suspiciously short GCLIDs (<10 chars) (€${shortGclids.reduce((s, c) => s + c.revenue, 0).toFixed(2)} / $${shortRevenue.toFixed(2)})`);
      }
    }

    // PERFORMANCE OPTIMIZATION: Cache the results
    await redisCacheManager.set(cacheKey, allConversions, {
      dataType: 'compado',
      ttl: 900 // 15 minutes for Compado conversions
    });
    console.log(`[COMPADO_API] ✓ Cached ${allConversions.length} conversions for ${start_date} to ${end_date}`);

    return allConversions;
  } catch (error) {
    console.error('Error fetching Compado conversions:', error);
    throw error;
  }
}

export function generateDailySummary(
  conversions: CompadoConversion[],
  useUsd: boolean = true
): CompadoDailySummary[] {
  const dailyMap = new Map<string, {
    conversions: number;
    revenue: number;
    campaigns: Set<string>;
  }>();

  conversions.forEach(conversion => {
    const date = conversion.timestamp.split('T')[0];

    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        conversions: 0,
        revenue: 0,
        campaigns: new Set()
      });
    }

    const dayData = dailyMap.get(date)!;
    dayData.conversions++;
    dayData.revenue += useUsd ? (conversion.revenueUsd || conversion.revenue) : conversion.revenue;
    dayData.campaigns.add(conversion.campaign_id);
  });

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    total_conversions: data.conversions,
    total_revenue: parseFloat(data.revenue.toFixed(2)),
    unique_campaigns: data.campaigns.size,
    average_revenue_per_conversion: parseFloat((data.revenue / data.conversions).toFixed(4))
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// Parse srcclkid to extract gclid and campaign_id
export function parseSrcClkId(srcclkid: string): { gclid: string; campaign_id: string } {
  const parts = srcclkid.split('_');
  return {
    gclid: parts[0] || srcclkid,
    campaign_id: parts[1] || 'unknown'
  };
}

export function groupByCampaign(
  conversions: CompadoConversion[],
  useUsd: boolean = true
): Map<string, {
  conversions: number;
  revenue: number;
  data: CompadoConversion[];
}> {
  const campaignMap = new Map<string, {
    conversions: number;
    revenue: number;
    data: CompadoConversion[];
  }>();

  conversions.forEach(conversion => {
    const campaignId = conversion.campaign_id;

    if (!campaignMap.has(campaignId)) {
      campaignMap.set(campaignId, {
        conversions: 0,
        revenue: 0,
        data: []
      });
    }

    const campaign = campaignMap.get(campaignId)!;
    campaign.conversions++;
    campaign.revenue += useUsd ? (conversion.revenueUsd || conversion.revenue) : conversion.revenue;
    campaign.data.push(conversion);
  });

  return campaignMap;
}

// Validate date format (YYYY-MM-DD)
export function validateDateFormat(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

export function getDateRange(days: number = 7): { start_date: string; end_date: string } {
  const now = new Date();

  // Get UTC dates to match Compado's timezone
  const endUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startUtc = new Date(endUtc);
  startUtc.setUTCDate(startUtc.getUTCDate() - days);

  return {
    start_date: startUtc.toISOString().split('T')[0],
    end_date: endUtc.toISOString().split('T')[0]
  };
}

// Cost-Revenue Mapping Interfaces
export interface CompadoCostRevenueMapping {
  gclid: string;
  campaign_id: string;
  campaign_name?: string;
  // Google Ads Metrics
  cost: number;
  clicks: number;
  impressions: number;
  cpc: number;
  cpa: number;
  // Compado Metrics
  conversions: number;
  revenue: number;
  conversion_rate: number;
  revenue_per_click: number;
  // Calculated Metrics
  profit: number;
  roi: number;
  roas: number;
  date: string;
}

export interface CompadoCostRevenueSummary {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  totalConversions: number;
  totalClicks: number;
  totalImpressions: number;
  overallROI: number;
  overallROAS: number;
  averageConversionRate: number;
  profitableCampaigns: number;
  totalCampaigns: number;
  profitabilityRate: number;
}

/**
 * Map Google Ads cost data with Compado conversion revenue
 * Matches by GCLID for accurate attribution
 *
 * IMPORTANT: Only conversions with GCLIDs matching the provided Google Ads clicks will be included.
 * This ensures account-specific filtering when viewing individual accounts.
 */
/**
 * Normalize GCLID for consistent matching
 * Handles case, whitespace, and special character variations
 */
function normalizeGclid(gclid: string): string {
  if (!gclid) return '';
  return gclid
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/gi, ''); // Remove special chars except underscore and hyphen
}

export function mapCompadoCostRevenue(
  googleAdsClicks: Array<{
    gclid: string;
    campaign_id: string;
    campaign_name?: string;
    cost: number;
    clicks?: number;
    impressions?: number;
    date?: string;
  }>,
  compadoConversions: CompadoConversion[],
  campaignNamesMap?: Map<string, string>
): CompadoCostRevenueMapping[] {
  console.log(`[COMPADO_MAPPING] Mapping ${googleAdsClicks.length} clicks with ${compadoConversions.length} conversions`);

  // Build a Set of campaign IDs from Google Ads clicks to identify account-specific campaigns
  const googleAdsCampaignIds = new Set(
    googleAdsClicks.map(click => String(click.campaign_id))
  );

  console.log(`[COMPADO_MAPPING] Account has ${googleAdsCampaignIds.size} unique campaign IDs`);
  if (googleAdsCampaignIds.size > 0 && googleAdsCampaignIds.size <= 5) {
    console.log(`[COMPADO_MAPPING] Campaign IDs: ${Array.from(googleAdsCampaignIds).join(', ')}`);
  }

  // Build a Set of GCLIDs from Google Ads clicks for fast filtering (with normalization)
  const googleAdsGclids = new Set(
    googleAdsClicks.map(click => normalizeGclid(click.gclid))
  );

  // Calculate total revenue BEFORE filtering (for diagnostics)
  const totalRevenueBeforeFilter = compadoConversions.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);
  const totalRevenueEurBeforeFilter = compadoConversions.reduce((sum, c) => sum + c.revenue, 0);

  // Filter Compado conversions to only include those with matching GCLIDs from this account
  // Using normalized GCLIDs for better matching (handles case, whitespace, special chars)
  const accountSpecificConversions = compadoConversions.filter(conv =>
    googleAdsGclids.has(normalizeGclid(conv.gclid))
  );

  // Calculate total revenue AFTER filtering (for diagnostics)
  const totalRevenueAfterFilter = accountSpecificConversions.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);
  const totalRevenueEurAfterFilter = accountSpecificConversions.reduce((sum, c) => sum + c.revenue, 0);

  // Track filtered-out conversions
  const filteredOutConversions = compadoConversions.filter(conv =>
    !googleAdsGclids.has(normalizeGclid(conv.gclid))
  );

  console.log(`[COMPADO_MAPPING] ==================== GCLID FILTERING REPORT ====================`);
  console.log(`[COMPADO_MAPPING] Total conversions from Compado API: ${compadoConversions.length}`);
  console.log(`[COMPADO_MAPPING] Google Ads GCLIDs available: ${googleAdsGclids.size}`);
  console.log(`[COMPADO_MAPPING] Conversions WITH matching GCLIDs: ${accountSpecificConversions.length}`);
  console.log(`[COMPADO_MAPPING] Conversions WITHOUT matching GCLIDs: ${filteredOutConversions.length}`);
  console.log(`[COMPADO_MAPPING] Match rate: ${compadoConversions.length > 0 ? ((accountSpecificConversions.length / compadoConversions.length) * 100).toFixed(1) : 0}%`);
  console.log(`[COMPADO_MAPPING] `);
  console.log(`[COMPADO_MAPPING] Revenue BEFORE filtering: €${totalRevenueEurBeforeFilter.toFixed(2)} → $${totalRevenueBeforeFilter.toFixed(2)}`);
  console.log(`[COMPADO_MAPPING] Revenue AFTER filtering: €${totalRevenueEurAfterFilter.toFixed(2)} → $${totalRevenueAfterFilter.toFixed(2)}`);
  console.log(`[COMPADO_MAPPING] Revenue LOST due to filtering: €${(totalRevenueEurBeforeFilter - totalRevenueEurAfterFilter).toFixed(2)} → $${(totalRevenueBeforeFilter - totalRevenueAfterFilter).toFixed(2)}`);
  console.log(`[COMPADO_MAPPING] Percentage filtered out: ${totalRevenueBeforeFilter > 0 ? ((1 - totalRevenueAfterFilter / totalRevenueBeforeFilter) * 100).toFixed(1) : 0}%`);

  // Analyze conversion timestamps to detect attribution window issues
  if (filteredOutConversions.length > 0) {
    console.log(`[COMPADO_MAPPING] `);
    console.log(`[COMPADO_MAPPING] ATTRIBUTION ANALYSIS:`);
    console.log(`[COMPADO_MAPPING]    - ${filteredOutConversions.length} conversions don't have matching GCLIDs in Google Ads`);
    console.log(`[COMPADO_MAPPING]    - This is usually because:`);
    console.log(`[COMPADO_MAPPING]      1. Click happened BEFORE the date range you selected (${googleAdsClicks[0]?.date || 'N/A'})`);
    console.log(`[COMPADO_MAPPING]      2. Different account/campaign (cross-account traffic)`);
    console.log(`[COMPADO_MAPPING]      3. Invalid or missing GCLID in Compado data`);
    console.log(`[COMPADO_MAPPING] `);
    console.log(`[COMPADO_MAPPING] SOLUTION: To improve matching for ANY date range:`);
    console.log(`[COMPADO_MAPPING]    - Query a wider date range (e.g., include previous 7-30 days)`);
    console.log(`[COMPADO_MAPPING]    - Or use the date range when the clicks actually occurred`);
    console.log(`[COMPADO_MAPPING] `);
    console.log(`[COMPADO_MAPPING] Sample of filtered-out conversions (first 5):`);
    filteredOutConversions.slice(0, 5).forEach((conv, idx) => {
      const convDate = conv.timestamp ? new Date(conv.timestamp).toISOString().split('T')[0] : 'N/A';
      console.log(`[COMPADO_MAPPING]    ${idx + 1}. GCLID: "${conv.gclid}" | Date: ${convDate} | €${conv.revenue.toFixed(2)} → $${(conv.revenueUsd || 0).toFixed(2)} | Ad ID: ${conv.ad_id || 'N/A'}`);
    });
    if (filteredOutConversions.length > 5) {
      console.log(`[COMPADO_MAPPING]    ... and ${filteredOutConversions.length - 5} more`);
    }
  }
  console.log(`[COMPADO_MAPPING] =================================================================`);

  // Use filtered conversions for mapping
  // IMPORTANT: Always use account-specific conversions, even if no clicks exist
  // If account has no clicks (zero spend), show zero revenue (not all Compado data)
  const conversionsToUse = accountSpecificConversions;

  const mappings: CompadoCostRevenueMapping[] = [];

  // Create a map of conversions by GCLID (using filtered conversions and normalized GCLIDs)
  const conversionMap = new Map<string, CompadoConversion[]>();
  conversionsToUse.forEach(conv => {
    const normalizedGclid = normalizeGclid(conv.gclid);
    if (!conversionMap.has(normalizedGclid)) {
      conversionMap.set(normalizedGclid, []);
    }
    conversionMap.get(normalizedGclid)!.push(conv);
  });

  console.log(`[COMPADO_MAPPING] Grouped conversions into ${conversionMap.size} unique GCLIDs`);

  // Debug: Show sample GCLIDs from both sources
  if (googleAdsClicks.length > 0) {
    const sampleGoogleGclids = googleAdsClicks.slice(0, 3).map(c => normalizeGclid(c.gclid));
    console.log(`[COMPADO_MAPPING] Sample Google Ads GCLIDs (first 3):`, sampleGoogleGclids);
  }
  if (conversionMap.size > 0) {
    const sampleCompadoGclids = Array.from(conversionMap.keys()).slice(0, 3);
    console.log(`[COMPADO_MAPPING] Sample Compado GCLIDs (first 3):`, sampleCompadoGclids);
  }

  // Track which conversions have been matched
  const matchedConversionGclids = new Set<string>();

  // If there are Google Ads clicks, map them with conversions
  if (googleAdsClicks.length > 0) {
    let totalMatchedConversions = 0;
    let totalMatchedRevenue = 0;

    googleAdsClicks.forEach((click, index) => {
      const normalizedGclid = normalizeGclid(click.gclid);
      const conversions = conversionMap.get(normalizedGclid) || [];

      const totalRevenueUsd = conversions.reduce((sum, conv) => sum + (conv.revenueUsd || conv.revenue), 0);
      const conversionCount = conversions.length;

      // Mark these conversions as matched
      conversions.forEach(conv => matchedConversionGclids.add(normalizeGclid(conv.gclid)));

      const cost = click.cost || 0;
      const clicks = click.clicks || 1;
      const impressions = click.impressions || clicks;
      const profit = totalRevenueUsd - cost;
      const roi = cost > 0 ? (profit / cost) * 100 : 0;
      const roas = cost > 0 ? totalRevenueUsd / cost : 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      const cpa = conversionCount > 0 ? cost / conversionCount : 0;
      const conversionRate = clicks > 0 ? (conversionCount / clicks) * 100 : 0;
      const revenuePerClick = clicks > 0 ? totalRevenueUsd / clicks : 0;

      mappings.push({
        gclid: click.gclid,
        campaign_id: click.campaign_id,
        campaign_name: click.campaign_name || `Campaign ${click.campaign_id}`,
        cost,
        clicks,
        impressions,
        cpc,
        cpa,
        conversions: conversionCount,
        revenue: totalRevenueUsd,
        conversion_rate: conversionRate,
        revenue_per_click: revenuePerClick,
        profit,
        roi,
        roas,
        date: click.date || new Date().toISOString().split('T')[0]
      });

      if (conversionCount > 0) {
        totalMatchedConversions += conversionCount;
        totalMatchedRevenue += totalRevenueUsd;
        console.log(`[COMPADO_MAPPING] ✓ Matched GCLID ${click.gclid.substring(0, 30)}... | Campaign: ${click.campaign_name} (ID: ${click.campaign_id}) | $${cost.toFixed(2)} cost → ${conversionCount} conversions → $${totalRevenueUsd.toFixed(2)} revenue`);
      }

      // Log first few clicks to understand campaign_id structure
      if (index < 3) {
        console.log(`[COMPADO_MAPPING] Click ${index + 1}: Campaign ID: ${click.campaign_id} | Name: ${click.campaign_name} | GCLID: ${normalizedGclid.substring(0, 20)}... | Conversions: ${conversionCount}`);
      }
    });

    console.log(`[COMPADO_MAPPING] Summary: ${totalMatchedConversions} conversions matched with $${totalMatchedRevenue.toFixed(2)} total revenue`);

    // Log unmatched conversions for debugging (but don't add them)
    // Only check within the filtered account-specific conversions
    const unmatchedConversions = conversionsToUse.filter(conv =>
      !matchedConversionGclids.has(normalizeGclid(conv.gclid))
    );

    if (unmatchedConversions.length > 0) {
      console.log(`[COMPADO_MAPPING] ${unmatchedConversions.length} unmatched Compado conversions (no matching Google Ads GCLID found):`);
      unmatchedConversions.slice(0, 3).forEach(conv => {
        console.log(`[COMPADO_MAPPING]    - GCLID: ${conv.gclid} | Revenue: $${(conv.revenueUsd || conv.revenue).toFixed(2)} | Ad ID: ${conv.ad_id}`);
      });
      if (unmatchedConversions.length > 3) {
        console.log(`[COMPADO_MAPPING]    ... and ${unmatchedConversions.length - 3} more`);
      }
    }
  } else {
    // No Google Ads clicks means no data to map
    console.log(`[COMPADO_MAPPING] No Google Ads clicks found for this account - returning empty mappings`);
  }

  console.log(`[COMPADO_MAPPING] Total mappings created: ${mappings.length}`);
  return mappings.sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending
}

/**
 * Aggregate click-level mappings to campaign-level summaries
 * @param mappings - Click-level cost/revenue mappings
 * @param allCampaignsMap - Optional: All campaigns from Google Ads (includes campaigns with zero clicks)
 *
 * NOTE: When aggregating across multiple accounts, campaigns are grouped by campaign_id.
 * If the same campaign_id exists in multiple accounts, they will be merged into one row.
 * This is the intended behavior for multi-account aggregation.
 */
export function aggregateMappingsByCampaign(
  mappings: CompadoCostRevenueMapping[],
  allCampaignsMap?: Map<string, { campaign_name: string; total_cost: number; total_clicks: number; impressions: number }>
): CompadoCostRevenueMapping[] {
  const campaignMap = new Map<string, {
    campaign_id: string;
    campaign_name: string;
    gclids: Set<string>;
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
    revenue: number;
    dates: Set<string>;
    costSource: 'campaign-level' | 'click-level';
  }>();

  // Start with campaign-level metrics (cost, clicks) even if no click-level data exists
  if (allCampaignsMap) {
    console.log(`[COMPADO_AGGREGATION] Initializing with ${allCampaignsMap.size} Google Ads campaigns`);
    allCampaignsMap.forEach((campaignData, campaignId) => {
      campaignMap.set(String(campaignId), {
        campaign_id: String(campaignId),
        campaign_name: campaignData.campaign_name,
        gclids: new Set(),
        cost: campaignData.total_cost || 0,
        clicks: campaignData.total_clicks || 0,
        impressions: campaignData.impressions || 0,
        conversions: 0,
        revenue: 0,
        dates: new Set(),
        costSource: 'campaign-level'
      });
      console.log(`[COMPADO_AGGREGATION]   - Campaign ${campaignId}: ${campaignData.campaign_name} | $${campaignData.total_cost?.toFixed(2)} cost, ${campaignData.total_clicks} clicks`);
    });
  }

  console.log(`[COMPADO_AGGREGATION] Processing ${mappings.length} click-level mappings for conversion/revenue data`);

  // Count mappings with conversions
  const mappingsWithConversions = mappings.filter(m => m.conversions > 0);
  console.log(`[COMPADO_AGGREGATION] Found ${mappingsWithConversions.length} mappings with conversions out of ${mappings.length} total`);

  // Add conversion and revenue data from mappings
  // CRITICAL: We DON'T add cost/clicks for Google Ads campaigns - only conversions/revenue
  let totalConversionsAdded = 0;
  let totalRevenueAdded = 0;

  mappings.forEach((mapping, index) => {
    const campaignId = String(mapping.campaign_id);

    if (!campaignMap.has(campaignId)) {

      console.log(`[COMPADO_AGGREGATION]   Revenue-only campaign: ${campaignId} (${mapping.campaign_name})`);
      campaignMap.set(campaignId, {
        campaign_id: campaignId,
        campaign_name: mapping.campaign_name || `Campaign ${campaignId}`,
        gclids: new Set(),
        cost: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        revenue: 0,
        dates: new Set(),
        costSource: 'click-level'
      });
    }

    const campaign = campaignMap.get(campaignId)!;
    const isRevenueOnlyCampaign = !allCampaignsMap || !allCampaignsMap.has(campaignId);

    if (isRevenueOnlyCampaign) {
      // For revenue-only campaigns, aggregate all data from mappings
      campaign.gclids.add(mapping.gclid);
      campaign.cost += mapping.cost;
      campaign.clicks += mapping.clicks;
      campaign.impressions += mapping.impressions;
      campaign.conversions += mapping.conversions;
      campaign.revenue += mapping.revenue;
      campaign.dates.add(mapping.date);
      campaign.costSource = 'click-level';
    } else {
      // CRITICAL FIX: For Google Ads campaigns, NEVER add cost/clicks from mappings
      // Only add conversion/revenue data (cost/clicks already set from campaign-level)
      campaign.gclids.add(mapping.gclid);
      campaign.conversions += mapping.conversions;
      campaign.revenue += mapping.revenue;
      campaign.dates.add(mapping.date);
      // Keep costSource as 'campaign-level' (already set during initialization)
    }

    if (mapping.conversions > 0) {
      totalConversionsAdded += mapping.conversions;
      totalRevenueAdded += mapping.revenue;
    }

    // Log first few mappings for debugging
    if (index < 5) {
      console.log(`[COMPADO_AGGREGATION]   - Mapping ${index + 1}: Campaign ID: ${campaignId} | Name: ${mapping.campaign_name} | Type: ${isRevenueOnlyCampaign ? 'revenue-only' : 'Google Ads'} | GCLID: ${mapping.gclid.substring(0, 20)}... | Conversions: ${mapping.conversions}, Revenue: $${mapping.revenue.toFixed(2)}`);
    }
  });

  console.log(`[COMPADO_AGGREGATION] Added ${totalConversionsAdded} total conversions and $${totalRevenueAdded.toFixed(2)} total revenue to campaigns`);

  console.log(`[COMPADO_AGGREGATION] Aggregated into ${campaignMap.size} unique campaigns`);

  // CRITICAL COST VALIDATION: Ensure Google Ads campaigns ALWAYS use campaign-level costs
  if (allCampaignsMap) {
    let correctionsMade = 0;
    campaignMap.forEach((campaign, campaignId) => {
      const originalCampaignData = allCampaignsMap.get(campaignId);

      if (originalCampaignData) {
        // ALWAYS use campaign-level cost for Google Ads campaigns (ignore any click-level inflation)
        const costDifference = Math.abs(campaign.cost - originalCampaignData.total_cost);

        if (costDifference > 0.01) { // Allow 1 cent tolerance for floating point
          console.warn(`[COMPADO_AGGREGATION] ⚠️  Cost discrepancy detected for "${campaign.campaign_name}":`);
          console.warn(`[COMPADO_AGGREGATION]     Campaign-level cost (Google Ads): $${originalCampaignData.total_cost.toFixed(2)}`);
          console.warn(`[COMPADO_AGGREGATION]     Aggregated cost (calculated): $${campaign.cost.toFixed(2)}`);
          console.warn(`[COMPADO_AGGREGATION]     Difference: $${costDifference.toFixed(2)}`);
          console.warn(`[COMPADO_AGGREGATION]     FIXING: Using campaign-level cost from Google Ads`);

          // ALWAYS use the campaign-level cost from Google Ads (the source of truth)
          campaign.cost = originalCampaignData.total_cost;
          campaign.clicks = originalCampaignData.total_clicks;
          campaign.impressions = originalCampaignData.impressions;
          campaign.costSource = 'campaign-level';
          correctionsMade++;
        }
      }

      console.log(`[COMPADO_AGGREGATION]   - ${campaign.campaign_name}: ${campaign.clicks} clicks, $${campaign.cost.toFixed(2)} cost (${campaign.costSource}), ${campaign.conversions} conversions, $${campaign.revenue.toFixed(2)} revenue`);
    });

    if (correctionsMade > 0) {
      console.warn(`[COMPADO_AGGREGATION] ✅ Fixed ${correctionsMade} campaigns with cost discrepancies`);
    }
  } else {
    campaignMap.forEach((campaign) => {
      console.log(`[COMPADO_AGGREGATION]   - ${campaign.campaign_name}: ${campaign.clicks} clicks, $${campaign.cost.toFixed(2)} cost (${campaign.costSource}), ${campaign.conversions} conversions, $${campaign.revenue.toFixed(2)} revenue`);
    });
  }

  // Convert to array with calculated metrics
  return Array.from(campaignMap.values()).map(campaign => {
    const profit = campaign.revenue - campaign.cost;
    const roi = campaign.cost > 0 ? (profit / campaign.cost) * 100 : 0;
    const roas = campaign.cost > 0 ? campaign.revenue / campaign.cost : 0;
    const cpc = campaign.clicks > 0 ? campaign.cost / campaign.clicks : 0;
    const cpa = campaign.conversions > 0 ? campaign.cost / campaign.conversions : 0;
    const conversionRate = campaign.clicks > 0 ? (campaign.conversions / campaign.clicks) * 100 : 0;
    const revenuePerClick = campaign.clicks > 0 ? campaign.revenue / campaign.clicks : 0;

    return {
      gclid: `${campaign.gclids.size} unique GCLIDs`,
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      cost: parseFloat(campaign.cost.toFixed(2)),
      clicks: campaign.clicks,
      impressions: campaign.impressions,
      cpc: parseFloat(cpc.toFixed(4)),
      cpa: parseFloat(cpa.toFixed(2)),
      conversions: campaign.conversions,
      revenue: parseFloat(campaign.revenue.toFixed(2)),
      conversion_rate: parseFloat(conversionRate.toFixed(2)),
      revenue_per_click: parseFloat(revenuePerClick.toFixed(4)),
      profit: parseFloat(profit.toFixed(2)),
      roi: parseFloat(roi.toFixed(2)),
      roas: parseFloat(roas.toFixed(2)),
      date: `${Array.from(campaign.dates).sort()[0]} to ${Array.from(campaign.dates).sort().pop()}`
    };
  }).sort((a, b) => b.revenue - a.revenue); // Sort by revenue descending
}

/**
 * Generate summary statistics from cost-revenue mappings
 */
export function getCompadoCostRevenueSummary(
  mappings: CompadoCostRevenueMapping[]
): CompadoCostRevenueSummary {
  if (mappings.length === 0) {
    return {
      totalCost: 0,
      totalRevenue: 0,
      totalProfit: 0,
      totalConversions: 0,
      totalClicks: 0,
      totalImpressions: 0,
      overallROI: 0,
      overallROAS: 0,
      averageConversionRate: 0,
      profitableCampaigns: 0,
      totalCampaigns: 0,
      profitabilityRate: 0
    };
  }

  const totalCost = mappings.reduce((sum, m) => sum + m.cost, 0);
  const totalRevenue = mappings.reduce((sum, m) => sum + m.revenue, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalConversions = mappings.reduce((sum, m) => sum + m.conversions, 0);
  const totalClicks = mappings.reduce((sum, m) => sum + m.clicks, 0);
  const totalImpressions = mappings.reduce((sum, m) => sum + m.impressions, 0);
  const profitableCampaigns = mappings.filter(m => m.profit > 0).length;

  return {
    totalCost: parseFloat(totalCost.toFixed(2)),
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalProfit: parseFloat(totalProfit.toFixed(2)),
    totalConversions,
    totalClicks,
    totalImpressions,
    overallROI: totalCost > 0 ? parseFloat(((totalProfit / totalCost) * 100).toFixed(2)) : 0,
    overallROAS: totalCost > 0 ? parseFloat((totalRevenue / totalCost).toFixed(2)) : 0,
    averageConversionRate: totalClicks > 0 ? parseFloat(((totalConversions / totalClicks) * 100).toFixed(2)) : 0,
    profitableCampaigns,
    totalCampaigns: mappings.length,
    profitabilityRate: parseFloat(((profitableCampaigns / mappings.length) * 100).toFixed(2))
  };
}
