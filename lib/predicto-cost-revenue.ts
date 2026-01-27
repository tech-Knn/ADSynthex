import { predictoApiClient } from './predicto-api';
import { normalizeCampaignId } from './predicto-url-builder';
import { extractChannelIdsFromUrl } from './predicto-channel-mapper';

export interface PredictoCostRevenueMapping {
  customer_id?: string; // Google Ads account ID
  campaign_id: string;
  campaign_name?: string;
  channel_ids: string[]; // Added channel IDs for tracking
  cost: number;
  clicks: number;
  impressions: number;
  conversions?: number;
  revenue: number;
  predicto_clicks?: number;
  predicto_impressions?: number;
  profit: number;
  roi: number;
  roas: number;
  rpc: number;
  cpa?: number;
  ctr: number;
  has_cost_data: boolean;
  has_revenue_data: boolean;
  date?: string;
}

export interface PredictoCostRevenueSummary {
  total_campaigns: number;
  campaigns_with_cost: number;
  campaigns_with_revenue: number;
  campaigns_matched: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  average_roi: number;
  average_roas: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  profitable_campaigns: number;
  unprofitable_campaigns: number;
  match_rate: number;
}

export interface AccountCostRevenueSummary {
  customer_id: string;
  account_name?: string;
  total_campaigns: number;
  campaigns_with_cost: number;
  campaigns_with_revenue: number;
  campaigns_matched: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  roi: number;
  roas: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
}

export const normalizeCampaignIdForMatching = (campaignId: string | number): string =>
  normalizeCampaignId(campaignId);

export function mapPredictoCostRevenue(
  googleAdsCampaigns: Array<{
    campaign_id: string;
    campaign_name?: string;
    cost: number;
    clicks: number;
    impressions: number;
    conversions?: number;
    date?: string;
  }>,
  predictoRevenue: Array<{
    campaign_id: string;
    revenue: number;
    clicks?: number;
    impressions?: number;
    date?: string;
  }>
): PredictoCostRevenueMapping[] {
  const revenueMap = new Map<string, { revenue: number; clicks: number; impressions: number }>();

  predictoRevenue.forEach((record) => {
    const normalizedId = normalizeCampaignIdForMatching(record.campaign_id);
    if (!revenueMap.has(normalizedId)) {
      revenueMap.set(normalizedId, { revenue: 0, clicks: 0, impressions: 0 });
    }
    const existing = revenueMap.get(normalizedId)!;
    existing.revenue += record.revenue || 0;
    existing.clicks += record.clicks || 0;
    existing.impressions += record.impressions || 0;
  });

  const costMap = new Map<
    string,
    { campaign_name?: string; cost: number; clicks: number; impressions: number; conversions: number }
  >();

  googleAdsCampaigns.forEach((campaign) => {
    const normalizedId = normalizeCampaignIdForMatching(campaign.campaign_id);
    if (!costMap.has(normalizedId)) {
      costMap.set(normalizedId, {
        campaign_name: campaign.campaign_name,
        cost: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
      });
    }
    const existing = costMap.get(normalizedId)!;
    existing.cost += campaign.cost || 0;
    existing.clicks += campaign.clicks || 0;
    existing.impressions += campaign.impressions || 0;
    existing.conversions += Math.round(campaign.conversions || 0);
  });

  const allCampaignIds = new Set<string>([...costMap.keys(), ...revenueMap.keys()]);
  const mappings: PredictoCostRevenueMapping[] = [];

  allCampaignIds.forEach((campaignId) => {
    const costData = costMap.get(campaignId);
    const revenueData = revenueMap.get(campaignId);

    const hasCost = !!costData && costData.cost > 0;
    const hasRevenue = !!revenueData && revenueData.revenue > 0;

    const cost = costData?.cost || 0;
    const clicks = costData?.clicks || 0;
    const impressions = costData?.impressions || 0;
    const conversions = Math.round(costData?.conversions || 0);
    const revenue = revenueData?.revenue || 0;

    const profit = revenue - cost;
    const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0;
    const roas = cost > 0 ? revenue / cost : 0;
    const rpc = clicks > 0 ? revenue / clicks : 0;
    const cpa = conversions > 0 ? cost / conversions : undefined;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

    mappings.push({
      campaign_id: campaignId,
      campaign_name: costData?.campaign_name,
      cost,
      clicks,
      impressions,
      conversions: conversions > 0 ? conversions : undefined,
      revenue,
      predicto_clicks: revenueData?.clicks,
      predicto_impressions: revenueData?.impressions,
      profit,
      roi,
      roas,
      rpc,
      cpa,
      ctr,
      has_cost_data: hasCost,
      has_revenue_data: hasRevenue,
      channel_ids: []
    });
  });

  return mappings.sort((a, b) => b.profit - a.profit);
}

export function aggregateMappingsByCampaign(
  mappings: PredictoCostRevenueMapping[]
): PredictoCostRevenueMapping[] {
  const campaignMap = new Map<string, PredictoCostRevenueMapping>();

  mappings.forEach((mapping) => {
    const existing = campaignMap.get(mapping.campaign_id);

    if (!existing) {
      campaignMap.set(mapping.campaign_id, { ...mapping });
    } else {
      existing.cost += mapping.cost;
      existing.clicks += mapping.clicks;
      existing.impressions += mapping.impressions;
      existing.conversions = Math.round((existing.conversions || 0) + (mapping.conversions || 0));
      existing.revenue += mapping.revenue;
      existing.predicto_clicks = (existing.predicto_clicks || 0) + (mapping.predicto_clicks || 0);
      existing.predicto_impressions =
        (existing.predicto_impressions || 0) + (mapping.predicto_impressions || 0);

      existing.profit = existing.revenue - existing.cost;
      existing.roi =
        existing.cost > 0 ? ((existing.revenue - existing.cost) / existing.cost) * 100 : 0;
      existing.roas = existing.cost > 0 ? existing.revenue / existing.cost : 0;
      existing.rpc = existing.clicks > 0 ? existing.revenue / existing.clicks : 0;
      existing.cpa =
        existing.conversions && existing.conversions > 0
          ? existing.cost / existing.conversions
          : undefined;
      existing.ctr = existing.impressions > 0 ? (existing.clicks / existing.impressions) * 100 : 0;

      existing.has_cost_data = existing.has_cost_data || mapping.has_cost_data;
      existing.has_revenue_data = existing.has_revenue_data || mapping.has_revenue_data;
    }
  });

  return Array.from(campaignMap.values()).sort((a, b) => b.profit - a.profit);
}

export function getPredictoCostRevenueSummary(
  mappings: PredictoCostRevenueMapping[]
): PredictoCostRevenueSummary {
  const totalCampaigns = mappings.length;
  const campaignsWithCost = mappings.filter((m) => m.has_cost_data).length;
  const campaignsWithRevenue = mappings.filter((m) => m.has_revenue_data).length;
  const campaignsMatched = mappings.filter((m) => m.has_cost_data && m.has_revenue_data).length;

  const totalCost = mappings.reduce((sum, m) => sum + m.cost, 0);
  const totalRevenue = mappings.reduce((sum, m) => sum + m.revenue, 0);
  const totalProfit = totalRevenue - totalCost;
  const averageRoi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
  const averageRoas = totalCost > 0 ? totalRevenue / totalCost : 0;

  const totalClicks = mappings.reduce((sum, m) => sum + m.clicks, 0);
  const totalImpressions = mappings.reduce((sum, m) => sum + m.impressions, 0);
  const totalConversions = mappings.reduce((sum, m) => sum + (m.conversions || 0), 0);

  const profitableCampaigns = mappings.filter((m) => m.profit > 0).length;
  const unprofitableCampaigns = mappings.filter((m) => m.profit < 0 && m.has_cost_data).length;

  const matchRate = totalCampaigns > 0 ? (campaignsMatched / totalCampaigns) * 100 : 0;

  return {
    total_campaigns: totalCampaigns,
    campaigns_with_cost: campaignsWithCost,
    campaigns_with_revenue: campaignsWithRevenue,
    campaigns_matched: campaignsMatched,
    total_cost: totalCost,
    total_revenue: totalRevenue,
    total_profit: totalProfit,
    average_roi: averageRoi,
    average_roas: averageRoas,
    total_clicks: totalClicks,
    total_impressions: totalImpressions,
    total_conversions: totalConversions,
    profitable_campaigns: profitableCampaigns,
    unprofitable_campaigns: unprofitableCampaigns,
    match_rate: matchRate,
  };
}

/**
 * Map cost and revenue by CHANNEL ID (not campaign_id)
 * This is the correct approach for Predicto integration
 */
export function mapCostRevenueByChannelId(
  googleAdsCampaigns: Array<{
    customer_id?: string;
    campaign_id: string;
    campaign_name?: string;
    final_urls?: string[];
    cost: number;
    clicks: number;
    impressions: number;
    conversions?: number;
  }>,
  predictoRevenue: Array<{
    custom_channel_id?: string;
    revenue?: number;
    clicks?: number;
    impressions?: number;
  }>
): PredictoCostRevenueMapping[] {
  console.log(`[PREDICTO_CHANNEL_MAPPING] Mapping ${googleAdsCampaigns.length} campaigns with ${predictoRevenue.length} Predicto records by channel ID`);

  // Step 1: Build channel-to-revenue map from Predicto data
  const channelRevenueMap = new Map<string, {
    revenue: number;
    clicks: number;
    impressions: number;
  }>();

  predictoRevenue.forEach(record => {
    const channelId = record.custom_channel_id;
    if (!channelId || channelId === 'unknown') return;

    // CRITICAL: Normalize channel ID to lowercase for consistent matching
    const normalizedChannelId = channelId.toLowerCase();

    if (!channelRevenueMap.has(normalizedChannelId)) {
      channelRevenueMap.set(normalizedChannelId, { revenue: 0, clicks: 0, impressions: 0 });
    }

    const channel = channelRevenueMap.get(normalizedChannelId)!;
    channel.revenue += record.revenue || 0;
    channel.clicks += record.clicks || 0;
    channel.impressions += record.impressions || 0;
  });

  console.log(`[PREDICTO_CHANNEL_MAPPING] Built revenue map with ${channelRevenueMap.size} unique channels`);

  // Debug: Log first 10 channel IDs from Predicto (now normalized to lowercase)
  const predictoChannelIds = Array.from(channelRevenueMap.keys()).slice(0, 10);
  console.log(`[PREDICTO_CHANNEL_MAPPING] Sample Predicto channels (normalized): ${predictoChannelIds.join(', ')}`);

  // Calculate total revenue from Predicto for debugging
  let totalPredictoRevenue = 0;
  channelRevenueMap.forEach(data => {
    totalPredictoRevenue += data.revenue;
  });
  console.log(`[PREDICTO_CHANNEL_MAPPING] Total revenue in Predicto: $${totalPredictoRevenue.toFixed(2)} across ${channelRevenueMap.size} channels`);

  // Step 2: Extract channel IDs from Google Ads campaigns and build campaign-to-channel map
  const campaignToChannelsMap = new Map<string, {
    customer_id?: string;
    campaign_id: string;
    campaign_name?: string;
    channel_ids: string[];
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
  }>();

  let campaignsWithChannels = 0;
  let campaignsWithoutChannels = 0;

  googleAdsCampaigns.forEach(campaign => {
    const channelIds: string[] = [];

    // Extract channel IDs from final URLs
    if (campaign.final_urls && campaign.final_urls.length > 0) {
      campaign.final_urls.forEach(url => {
        const extractedIds = extractChannelIdsFromUrl(url);
        channelIds.push(...extractedIds);
      });
    }

    // Remove duplicates
    const uniqueChannelIds = [...new Set(channelIds)];

    if (uniqueChannelIds.length > 0) {
      campaignsWithChannels++;
    } else {
      campaignsWithoutChannels++;
      // Log warning for campaigns with cost but no channel IDs
      if (campaign.cost > 0) {
        console.log(`[PREDICTO_CHANNEL_MAPPING] Campaign ${campaign.campaign_id} (${campaign.campaign_name || 'unnamed'}) has $${campaign.cost.toFixed(2)} cost but no channel IDs - check if final_urls contain cid parameter`);
      }
    }

    // CRITICAL FIX: Aggregate per-day records instead of overwriting
    // If campaign already exists, ADD to metrics instead of replacing
    const existingCampaign = campaignToChannelsMap.get(campaign.campaign_id);
    if (existingCampaign) {
      // Campaign already exists - aggregate the metrics
      existingCampaign.cost += campaign.cost || 0;
      existingCampaign.clicks += campaign.clicks || 0;
      existingCampaign.impressions += campaign.impressions || 0;
      existingCampaign.conversions += Math.round(campaign.conversions || 0);
      // Merge channel IDs
      const mergedChannelIds = [...new Set([...existingCampaign.channel_ids, ...uniqueChannelIds])];
      existingCampaign.channel_ids = mergedChannelIds;
    } else {
      // First time seeing this campaign - add it
      campaignToChannelsMap.set(campaign.campaign_id, {
        customer_id: campaign.customer_id,
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        channel_ids: uniqueChannelIds,
        cost: campaign.cost || 0,
        clicks: campaign.clicks || 0,
        impressions: campaign.impressions || 0,
        conversions: Math.round(campaign.conversions || 0),
      });
    }
  });

  console.log(`[PREDICTO_CHANNEL_MAPPING] Extracted channels: ${campaignsWithChannels} campaigns with channels, ${campaignsWithoutChannels} without`);

  // Debug: Log sample campaign channel IDs from Google Ads (now normalized to lowercase)
  const sampleCampaignWithChannels = Array.from(campaignToChannelsMap.values()).find(c => c.channel_ids.length > 0);
  if (sampleCampaignWithChannels) {
    console.log(`[PREDICTO_CHANNEL_MAPPING] Sample campaign channels (normalized): ${sampleCampaignWithChannels.channel_ids.join(', ')}`);
  }

  // Log all unique channel IDs extracted from Google Ads
  const allGoogleAdsChannels = new Set<string>();
  campaignToChannelsMap.forEach(campaign => {
    campaign.channel_ids.forEach(id => allGoogleAdsChannels.add(id));
  });
  console.log(`[PREDICTO_CHANNEL_MAPPING] Total unique Google Ads channels: ${allGoogleAdsChannels.size}`);

  // Step 3: Combine cost and revenue by matching channel IDs
  const mappings: PredictoCostRevenueMapping[] = [];

  // Track matching statistics
  let campaignsWithMatchedRevenue = 0;
  let campaignsWithCostButNoRevenue = 0;
  let totalMatchedChannels = 0;
  let totalUnmatchedChannels = 0;

  // Add campaigns with cost data (and possibly revenue)
  campaignToChannelsMap.forEach(campaignData => {
    let totalRevenue = 0;
    let totalPredictoClicks = 0;
    let totalPredictoImpressions = 0;

    // Track which channels matched for this campaign
    let matchedChannels = 0;
    let unmatchedChannels = 0;

    // Sum revenue from all associated channels
    campaignData.channel_ids.forEach(channelId => {
      const revenueData = channelRevenueMap.get(channelId);
      if (revenueData) {
        totalRevenue += revenueData.revenue;
        totalPredictoClicks += revenueData.clicks;
        totalPredictoImpressions += revenueData.impressions;
        matchedChannels++;
      } else {
        unmatchedChannels++;
      }
    });

    // Track campaign-level matching
    if (totalRevenue > 0 && campaignData.cost > 0) {
      campaignsWithMatchedRevenue++;
    } else if (campaignData.cost > 0) {
      campaignsWithCostButNoRevenue++;
    }

    totalMatchedChannels += matchedChannels;
    totalUnmatchedChannels += unmatchedChannels;

    const cost = campaignData.cost;
    const profit = totalRevenue - cost;
    const roi = cost > 0 ? ((totalRevenue - cost) / cost) * 100 : 0;
    const roas = cost > 0 ? totalRevenue / cost : 0;
    // CRITICAL: Use PREDICTO clicks for RPC (Revenue Per Click), not Google Ads clicks
    const rpc = totalPredictoClicks > 0 ? totalRevenue / totalPredictoClicks : 0;
    const cpa = campaignData.conversions > 0 ? cost / campaignData.conversions : undefined;
    // CRITICAL: Use PREDICTO data for CTR (Click Through Rate), not Google Ads data
    const ctr = totalPredictoImpressions > 0 ? (totalPredictoClicks / totalPredictoImpressions) * 100 : 0;

    mappings.push({
      customer_id: campaignData.customer_id,
      campaign_id: campaignData.campaign_id,
      campaign_name: campaignData.campaign_name,
      channel_ids: campaignData.channel_ids,
      cost,
      // CRITICAL: Use PREDICTO clicks/impressions as primary metrics (revenue comes from Predicto, so clicks should too)
      clicks: totalPredictoClicks,
      impressions: totalPredictoImpressions,
      conversions: campaignData.conversions > 0 ? Math.round(campaignData.conversions) : undefined,
      revenue: totalRevenue,
      predicto_clicks: totalPredictoClicks,
      predicto_impressions: totalPredictoImpressions,
      profit,
      roi,
      roas,
      rpc,
      cpa,
      ctr,
      has_cost_data: cost > 0,
      has_revenue_data: totalRevenue > 0,
    });
  });

  // Step 4: Build channel-to-customer mapping
  // This maps each channel ID to its account's customer_id
  const channelToCustomerMap = new Map<string, string>();
  campaignToChannelsMap.forEach(campaign => {
    if (campaign.customer_id) {
      campaign.channel_ids.forEach(channelId => {
        // Store the customer_id for this channel
        channelToCustomerMap.set(channelId, campaign.customer_id!);
      });
    }
  });

  console.log(`[PREDICTO_CHANNEL_MAPPING] Built channel-to-customer map with ${channelToCustomerMap.size} channel→customer mappings`);

  // Log matching statistics
  console.log(`[PREDICTO_CHANNEL_MAPPING] Matching results:`);
  console.log(`  - Campaigns with BOTH cost & revenue: ${campaignsWithMatchedRevenue}`);
  console.log(`  - Campaigns with cost but NO revenue: ${campaignsWithCostButNoRevenue}`);
  console.log(`  - Matched channels: ${totalMatchedChannels}`);
  console.log(`  - Unmatched channels: ${totalUnmatchedChannels}`);

  if (campaignsWithCostButNoRevenue > 0) {
    console.warn(`[PREDICTO_CHANNEL_MAPPING] 🚨 ${campaignsWithCostButNoRevenue} campaigns have cost but NO revenue match!`);
    console.warn(`[PREDICTO_CHANNEL_MAPPING] This suggests channel IDs in URLs don't match Predicto custom_channel_id`);

    // CRITICAL DIAGNOSTIC: Compare Google Ads channels vs Predicto channels
    console.log(`[PREDICTO_CHANNEL_MAPPING] ===== CHANNEL MISMATCH DIAGNOSTIC =====`);
    console.log(`[PREDICTO_CHANNEL_MAPPING] Google Ads channels (from URLs): ${Array.from(allGoogleAdsChannels).slice(0, 20).join(', ')}`);
    console.log(`[PREDICTO_CHANNEL_MAPPING] Predicto channels (from API): ${Array.from(channelRevenueMap.keys()).slice(0, 20).join(', ')}`);

    // Find channels in Google Ads but NOT in Predicto
    const googleAdsOnly = Array.from(allGoogleAdsChannels).filter(ch => !channelRevenueMap.has(ch));
    console.log(`[PREDICTO_CHANNEL_MAPPING] 🔍 Google Ads channels NOT in Predicto (${googleAdsOnly.length}): ${googleAdsOnly.slice(0, 10).join(', ')}`);

    // Find channels in Predicto but NOT in Google Ads
    const predictoOnly = Array.from(channelRevenueMap.keys()).filter(ch => !allGoogleAdsChannels.has(ch));
    console.log(`[PREDICTO_CHANNEL_MAPPING] 🔍 Predicto channels NOT in Google Ads (${predictoOnly.length}): ${predictoOnly.slice(0, 10).join(', ')}`);

    // Find channels in BOTH
    const matchingChannels = Array.from(allGoogleAdsChannels).filter(ch => channelRevenueMap.has(ch));
    console.log(`[PREDICTO_CHANNEL_MAPPING] ✅ Matching channels (${matchingChannels.length}): ${matchingChannels.slice(0, 10).join(', ')}`);

    // Show which channels are not matching
    const unmatchedChannels = new Set<string>();
    campaignToChannelsMap.forEach(campaign => {
      campaign.channel_ids.forEach(channelId => {
        if (!channelRevenueMap.has(channelId)) {
          unmatchedChannels.add(channelId);
        }
      });
    });

    if (unmatchedChannels.size > 0) {
      console.warn(`[PREDICTO_CHANNEL_MAPPING] Unmatched channel IDs (in Google Ads URLs but NOT in Predicto):`);
      console.warn(`[PREDICTO_CHANNEL_MAPPING]    ${Array.from(unmatchedChannels).slice(0, 20).join(', ')}`);
      console.warn(`[PREDICTO_CHANNEL_MAPPING]    These channels need to be updated in Google Ads final URLs!`);
    }

    // Show channels that exist in Predicto but not in campaigns
    const orphanedPredictoChannels = new Set<string>();
    let orphanedRevenue = 0;
    channelRevenueMap.forEach((data, channelId) => {
      let found = false;
      campaignToChannelsMap.forEach(campaign => {
        if (campaign.channel_ids.includes(channelId)) {
          found = true;
        }
      });
      if (!found) {
        orphanedPredictoChannels.add(channelId);
        orphanedRevenue += data.revenue;
      }
    });

    if (orphanedPredictoChannels.size > 0) {
      console.warn(`[PREDICTO_CHANNEL_MAPPING] 💰 Orphaned Predicto channels (revenue available but NOT in any Google Ads campaign URL):`);
      console.warn(`[PREDICTO_CHANNEL_MAPPING]    ${Array.from(orphanedPredictoChannels).slice(0, 20).join(', ')}`);
      console.warn(`[PREDICTO_CHANNEL_MAPPING]    Missing revenue: $${orphanedRevenue.toFixed(2)} from ${orphanedPredictoChannels.size} channels`);
      console.warn(`[PREDICTO_CHANNEL_MAPPING]    Add these channel IDs to your Google Ads campaign URLs to capture this revenue!`);
    }
  }

  // Step 5: Add orphaned channels (revenue but no cost)
  const assignedChannels = new Set<string>();
  campaignToChannelsMap.forEach(campaign => {
    campaign.channel_ids.forEach(id => assignedChannels.add(id));
  });

  channelRevenueMap.forEach((revenueData, channelId) => {
    if (!assignedChannels.has(channelId) && revenueData.revenue > 0) {
      const rpc = revenueData.clicks > 0 ? revenueData.revenue / revenueData.clicks : 0;
      const ctr = revenueData.impressions > 0 ? (revenueData.clicks / revenueData.impressions) * 100 : 0;

      // CRITICAL FIX: Assign customer_id to orphaned channels
      // Look up which account this channel belongs to
      const customerId = channelToCustomerMap.get(channelId);

      mappings.push({
        customer_id: customerId, // Assign customer_id so it won't be filtered out
        campaign_id: channelId,
        campaign_name: `Channel ${channelId}`,
        channel_ids: [channelId],
        cost: 0,
        clicks: revenueData.clicks,
        impressions: revenueData.impressions,
        revenue: revenueData.revenue,
        predicto_clicks: revenueData.clicks,
        predicto_impressions: revenueData.impressions,
        profit: revenueData.revenue,
        roi: 0,
        roas: 0,
        rpc,
        ctr,
        has_cost_data: false,
        has_revenue_data: true,
      });
    }
  });

  // Sort by profit descending
  mappings.sort((a, b) => b.profit - a.profit);

  const withBoth = mappings.filter(m => m.has_cost_data && m.has_revenue_data).length;
  const costOnly = mappings.filter(m => m.has_cost_data && !m.has_revenue_data).length;
  const revenueOnly = mappings.filter(m => !m.has_cost_data && m.has_revenue_data).length;

  console.log(`[PREDICTO_CHANNEL_MAPPING] Mapped ${mappings.length} total items: ${withBoth} with both, ${costOnly} cost-only, ${revenueOnly} revenue-only`);

  return mappings;
}

export async function fetchPredictoCostRevenueMapping(
  startDate: string,
  endDate: string,
  googleAdsCampaigns: Array<{
    campaign_id: string;
    campaign_name?: string;
    cost: number;
    clicks: number;
    impressions: number;
    conversions?: number;
    date?: string;
  }>
) {
  console.log(`[PREDICTO_MAPPING] Fetching Predicto revenue with custom_channel_id for ${googleAdsCampaigns.length} Google Ads campaigns`);

  const predictoRevenue = await predictoApiClient.fetchRevenueData({
    start_date: startDate,
    end_date: endDate,
    metrics: ['impressions', 'clicks', 'revenue'],
    dimensions: ['custom_channel_id', 'date'],
  });

  console.log(`[PREDICTO_MAPPING] Retrieved ${predictoRevenue.length} Predicto revenue records`);

  // Filter out records without custom_channel_id and ensure proper typing
  const validPredictoRevenue = predictoRevenue
    .filter(record => record.custom_channel_id && record.custom_channel_id !== 'unknown')
    .map(record => ({
      campaign_id: record.custom_channel_id!, // Use custom_channel_id as the identifier
      revenue: record.revenue || 0,
      clicks: record.clicks,
      impressions: record.impressions,
      date: record.date,
    }));

  console.log(`[PREDICTO_MAPPING] ${validPredictoRevenue.length} records have valid channel IDs`);

  const mappings = mapPredictoCostRevenue(googleAdsCampaigns, validPredictoRevenue);
  const aggregated = aggregateMappingsByCampaign(mappings);
  const summary = getPredictoCostRevenueSummary(aggregated);

  return { mappings, aggregated, summary };
}

/**
 * NEW: Fetch and map cost/revenue by channel ID (recommended approach)
 */
export async function fetchCostRevenueByChannelId(
  startDate: string,
  endDate: string,
  googleAdsCampaigns: Array<{
    campaign_id: string;
    campaign_name?: string;
    final_urls?: string[];
    cost: number;
    clicks: number;
    impressions: number;
    conversions?: number;
  }>
) {
  console.log(`[PREDICTO_CHANNEL_MAPPING] Starting channel-based cost/revenue mapping for ${startDate} to ${endDate}`);
  console.log(`[PREDICTO_CHANNEL_MAPPING] Processing ${googleAdsCampaigns.length} Google Ads campaigns`);

  // Fetch Predicto revenue by channel ID
  const predictoRevenue = await predictoApiClient.fetchRevenueData({
    start_date: startDate,
    end_date: endDate,
    metrics: ['impressions', 'clicks', 'revenue'],
    dimensions: ['custom_channel_id', 'date'],
  });

  console.log(`[PREDICTO_CHANNEL_MAPPING] Retrieved ${predictoRevenue.length} Predicto revenue records`);

  // Map cost and revenue by channel ID
  const mappings = mapCostRevenueByChannelId(googleAdsCampaigns, predictoRevenue);
  const aggregated = aggregateMappingsByCampaign(mappings);
  const summary = getPredictoCostRevenueSummary(aggregated);

  console.log(`[PREDICTO_CHANNEL_MAPPING] Summary: $${summary.total_cost.toFixed(2)} cost, $${summary.total_revenue.toFixed(2)} revenue, ${summary.average_roi.toFixed(1)}% ROI`);
  console.log(`[PREDICTO_CHANNEL_MAPPING] Match rate: ${summary.match_rate.toFixed(1)}% (${summary.campaigns_matched}/${summary.total_campaigns} campaigns)`);

  return { mappings, aggregated, summary };
}

/**
 * Get account name from customer ID
 */
function getAccountName(customerId: string): string {
  const accountNames: Record<string, string> = {
    '2382992113': 'Predicto - EST - 01',
    '1640518611': 'Predicto - EST - 02',
    '8091270364': 'Predicto - EST - 03',
    '8846129452': 'Predicto - EST - 04',
    '6474140466': 'Predicto - EST - 05',
    '4920639194': 'Predicto - EST - 06',
    '7282297343': 'Predicto - EST - 07',
    '1298005744': 'Predicto - EST - 08',
    '5777354952': 'Predicto - EST - 09',
    '1449565595': 'Predicto - EST - 10',
  };
  return accountNames[customerId] || `Account ${customerId}`;
}

/**
 * Aggregate cost/revenue data by account (customer_id)
 * Provides account-level breakdown of performance
 */
export function aggregateByAccount(
  mappings: PredictoCostRevenueMapping[]
): AccountCostRevenueSummary[] {
  const accountMap = new Map<string, {
    customer_id: string;
    campaigns: PredictoCostRevenueMapping[];
  }>();

  // Filter out orphaned channels (revenue-only items without customer_id)
  // These are channels with revenue but no matching Google Ads campaign
  const mappingsWithAccounts = mappings.filter(m => m.customer_id && m.customer_id !== 'unknown');

  console.log(`[PREDICTO_ACCOUNT_AGGREGATION] Filtering ${mappings.length} mappings → ${mappingsWithAccounts.length} with valid customer_id`);

  // Group mappings by customer_id
  mappingsWithAccounts.forEach(mapping => {
    const customerId = mapping.customer_id!;

    if (!accountMap.has(customerId)) {
      accountMap.set(customerId, {
        customer_id: customerId,
        campaigns: []
      });
    }

    accountMap.get(customerId)!.campaigns.push(mapping);
  });

  // Calculate account-level summaries
  const accountSummaries: AccountCostRevenueSummary[] = [];

  accountMap.forEach((accountData, customerId) => {
    const campaigns = accountData.campaigns;

    const totalCampaigns = campaigns.length;
    const campaignsWithCost = campaigns.filter(c => c.has_cost_data).length;
    const campaignsWithRevenue = campaigns.filter(c => c.has_revenue_data).length;
    const campaignsMatched = campaigns.filter(c => c.has_cost_data && c.has_revenue_data).length;

    const totalCost = campaigns.reduce((sum, c) => sum + c.cost, 0);
    const totalRevenue = campaigns.reduce((sum, c) => sum + c.revenue, 0);
    const totalProfit = totalRevenue - totalCost;
    const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
    const roas = totalCost > 0 ? totalRevenue / totalCost : 0;

    const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);

    accountSummaries.push({
      customer_id: customerId,
      account_name: getAccountName(customerId),
      total_campaigns: totalCampaigns,
      campaigns_with_cost: campaignsWithCost,
      campaigns_with_revenue: campaignsWithRevenue,
      campaigns_matched: campaignsMatched,
      total_cost: totalCost,
      total_revenue: totalRevenue,
      total_profit: totalProfit,
      roi,
      roas,
      total_clicks: totalClicks,
      total_impressions: totalImpressions,
      total_conversions: totalConversions,
    });
  });

  // Sort by total cost descending
  const sorted = accountSummaries.sort((a, b) => b.total_cost - a.total_cost);

  // Log account-level summary
  console.log(`[PREDICTO_ACCOUNT_AGGREGATION] Account summaries:`);
  sorted.forEach(account => {
    console.log(`  - ${account.account_name}: $${account.total_cost.toFixed(2)} cost, $${account.total_revenue.toFixed(2)} revenue, ${account.roi.toFixed(1)}% ROI (${account.campaigns_matched}/${account.total_campaigns} matched)`);
  });

  return sorted;
}
