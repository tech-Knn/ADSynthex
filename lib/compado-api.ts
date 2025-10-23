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
    const allConversions: CompadoConversion[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    console.log('[COMPADO_API] Fetching conversions with NEW API format...');
    const exchangeRate = await getExchangeRate();
    console.log(`[COMPADO_API] Exchange rate: EUR to USD = ${exchangeRate}`);

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
    console.log(`[COMPADO_API] ${allConversions.length} conversions: €${totalRevenueEur.toFixed(2)} → $${totalRevenueUsd.toFixed(2)} (rate: ${exchangeRate})`);

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

  // Build a Set of GCLIDs from Google Ads clicks for fast filtering
  const googleAdsGclids = new Set(
    googleAdsClicks.map(click => click.gclid.toLowerCase().trim())
  );

  // Filter Compado conversions to only include those with matching GCLIDs from this account
  // NOTE: We filter by GCLID only since Compado might not have accurate campaign_id mapping
  const accountSpecificConversions = compadoConversions.filter(conv =>
    googleAdsGclids.has(conv.gclid.toLowerCase().trim())
  );

  console.log(`[COMPADO_MAPPING] Filtered to ${accountSpecificConversions.length} account-specific conversions (from ${compadoConversions.length} total)`);

  // Use filtered conversions for mapping
  // IMPORTANT: Always use account-specific conversions, even if no clicks exist
  // If account has no clicks (zero spend), show zero revenue (not all Compado data)
  const conversionsToUse = accountSpecificConversions;

  const mappings: CompadoCostRevenueMapping[] = [];

  // Create a map of conversions by GCLID (using filtered conversions)
  const conversionMap = new Map<string, CompadoConversion[]>();
  conversionsToUse.forEach(conv => {
    const gclid = conv.gclid.toLowerCase().trim();
    if (!conversionMap.has(gclid)) {
      conversionMap.set(gclid, []);
    }
    conversionMap.get(gclid)!.push(conv);
  });

  console.log(`[COMPADO_MAPPING] Grouped conversions into ${conversionMap.size} unique GCLIDs`);

  // Debug: Show sample GCLIDs from both sources
  if (googleAdsClicks.length > 0) {
    const sampleGoogleGclids = googleAdsClicks.slice(0, 3).map(c => c.gclid.toLowerCase().trim());
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
      const gclid = click.gclid.toLowerCase().trim();
      const conversions = conversionMap.get(gclid) || [];

      const totalRevenueUsd = conversions.reduce((sum, conv) => sum + (conv.revenueUsd || conv.revenue), 0);
      const totalRevenueEur = conversions.reduce((sum, conv) => sum + conv.revenue, 0);
      const conversionCount = conversions.length;

      // Mark these conversions as matched
      conversions.forEach(conv => matchedConversionGclids.add(conv.gclid.toLowerCase().trim()));

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
        console.log(`[COMPADO_MAPPING] Click ${index + 1}: Campaign ID: ${click.campaign_id} | Name: ${click.campaign_name} | GCLID: ${gclid.substring(0, 20)}... | Conversions: ${conversionCount}`);
      }
    });

    console.log(`[COMPADO_MAPPING] Summary: ${totalMatchedConversions} conversions matched with $${totalMatchedRevenue.toFixed(2)} total revenue`);

    // Log unmatched conversions for debugging (but don't add them)
    // Only check within the filtered account-specific conversions
    const unmatchedConversions = conversionsToUse.filter(conv =>
      !matchedConversionGclids.has(conv.gclid.toLowerCase().trim())
    );

    if (unmatchedConversions.length > 0) {
      console.log(`[COMPADO_MAPPING] ⚠️  ${unmatchedConversions.length} unmatched Compado conversions (no matching Google Ads GCLID found):`);
      unmatchedConversions.slice(0, 3).forEach(conv => {
        console.log(`[COMPADO_MAPPING]    - GCLID: ${conv.gclid} | Revenue: $${(conv.revenueUsd || conv.revenue).toFixed(2)} | Ad ID: ${conv.ad_id}`);
      });
      if (unmatchedConversions.length > 3) {
        console.log(`[COMPADO_MAPPING]    ... and ${unmatchedConversions.length - 3} more`);
      }
    }
  } else {
    // No Google Ads clicks means no data to map
    console.log(`[COMPADO_MAPPING] ℹ️  No Google Ads clicks found for this account - returning empty mappings`);
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
        dates: new Set()
      });
      console.log(`[COMPADO_AGGREGATION]   - Campaign ${campaignId}: ${campaignData.campaign_name} | $${campaignData.total_cost?.toFixed(2)} cost, ${campaignData.total_clicks} clicks`);
    });
  }

  console.log(`[COMPADO_AGGREGATION] Processing ${mappings.length} click-level mappings for conversion/revenue data`);

  // Count mappings with conversions
  const mappingsWithConversions = mappings.filter(m => m.conversions > 0);
  console.log(`[COMPADO_AGGREGATION] Found ${mappingsWithConversions.length} mappings with conversions out of ${mappings.length} total`);

  // Add conversion and revenue data from mappings
  // NOTE: We DON'T add cost/clicks here since we already have campaign-level totals
  let totalConversionsAdded = 0;
  let totalRevenueAdded = 0;

  mappings.forEach((mapping, index) => {
    const campaignId = String(mapping.campaign_id);

    if (!campaignMap.has(campaignId)) {
      
      console.log(`[COMPADO_AGGREGATION]   💰 Revenue-only campaign: ${campaignId} (${mapping.campaign_name})`);
      campaignMap.set(campaignId, {
        campaign_id: campaignId,
        campaign_name: mapping.campaign_name || `Campaign ${campaignId}`,
        gclids: new Set(),
        cost: 0, 
        clicks: 0, 
        impressions: 0, 
        conversions: 0,
        revenue: 0,
        dates: new Set()
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
    } else {
      // For Google Ads campaigns, only add conversion/revenue (cost/clicks come from campaign-level)
      campaign.gclids.add(mapping.gclid);
      campaign.conversions += mapping.conversions;
      campaign.revenue += mapping.revenue;
      campaign.dates.add(mapping.date);
    }

    if (mapping.conversions > 0) {
      totalConversionsAdded += mapping.conversions;
      totalRevenueAdded += mapping.revenue;
    }

    // Log first few mappings for debugging
    if (index < 5) {
      console.log(`[COMPADO_AGGREGATION]   - Mapping ${index + 1}: Campaign ID: ${campaignId} | Name: ${mapping.campaign_name} | GCLID: ${mapping.gclid.substring(0, 20)}... | Conversions: ${mapping.conversions}, Revenue: $${mapping.revenue.toFixed(2)}`);
    }
  });

  console.log(`[COMPADO_AGGREGATION] Added ${totalConversionsAdded} total conversions and $${totalRevenueAdded.toFixed(2)} total revenue to campaigns`);

  console.log(`[COMPADO_AGGREGATION] Aggregated into ${campaignMap.size} unique campaigns`);

  // COST VALIDATION: Check for inflation and correct it
  if (allCampaignsMap) {
    campaignMap.forEach((campaign, campaignId) => {
      const originalCampaignData = allCampaignsMap.get(campaignId);

      if (originalCampaignData && originalCampaignData.total_cost > 0) {
        const inflationAmount = campaign.cost - originalCampaignData.total_cost;
        const inflationPercent = (inflationAmount / originalCampaignData.total_cost) * 100;

        // If aggregated cost is more than 5% higher than campaign-level cost, it's inflated
        if (inflationPercent > 5) {
          console.warn(`[COMPADO_AGGREGATION] ⚠️  Cost inflation detected for ${campaign.campaign_name}:`);
          console.warn(`[COMPADO_AGGREGATION]     Campaign-level cost: $${originalCampaignData.total_cost.toFixed(2)}`);
          console.warn(`[COMPADO_AGGREGATION]     Aggregated cost: $${campaign.cost.toFixed(2)}`);
          console.warn(`[COMPADO_AGGREGATION]     Inflation: +$${inflationAmount.toFixed(2)} (+${inflationPercent.toFixed(1)}%)`);
          console.warn(`[COMPADO_AGGREGATION]     CORRECTING: Using campaign-level cost instead`);

          // Correct the inflation by using campaign-level cost
          campaign.cost = originalCampaignData.total_cost;
          campaign.clicks = originalCampaignData.total_clicks;
          campaign.impressions = originalCampaignData.impressions;
        }
      }

      console.log(`[COMPADO_AGGREGATION]   - ${campaign.campaign_name}: ${campaign.clicks} clicks, $${campaign.cost.toFixed(2)} cost, ${campaign.conversions} conversions, $${campaign.revenue.toFixed(2)} revenue`);
    });
  } else {
    campaignMap.forEach((campaign) => {
      console.log(`[COMPADO_AGGREGATION]   - ${campaign.campaign_name}: ${campaign.clicks} clicks, $${campaign.cost.toFixed(2)} cost, ${campaign.conversions} conversions, $${campaign.revenue.toFixed(2)} revenue`);
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
