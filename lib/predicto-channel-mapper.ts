/**
 * Predicto Channel Mapper
 * Maps Google Ads campaigns to Predicto revenue using custom_channel_id (cid parameter)
 */

/**
 * Extract channel IDs from a Google Ads Final URL
 * Example URL: https://tunefulsoul.com/asrsearch?cid=ch88087+ch88098&campaign_id={campaignid}
 * Returns: ['ch88087', 'ch88098']
 */
export function extractChannelIdsFromUrl(url: string): string[] {
  if (!url) return [];

  try {
    const urlObj = new URL(url);
    const cidParam = urlObj.searchParams.get('cid');

    if (!cidParam) return [];

    // Split by + or , or space to handle multiple channel IDs
    // CRITICAL: Normalize to lowercase for consistent matching
    const channelIds = cidParam
      .split(/[+,\s]+/)
      .map(id => id.trim().toLowerCase()) // Convert to lowercase
      .filter(id => id.length > 0);

    return channelIds;
  } catch (error) {
    // If URL parsing fails, try regex as fallback
    const cidMatch = url.match(/[?&]cid=([^&]+)/);
    if (cidMatch) {
      return cidMatch[1]
        .split(/[+,\s]+/)
        .map(id => id.trim().toLowerCase()) // Convert to lowercase
        .filter(id => id.length > 0);
    }
    return [];
  }
}

/**
 * Map Google Ads campaigns to Predicto channel IDs
 */
export function mapCampaignsToChannels(campaigns: Array<{
  campaign_id: string;
  campaign_name?: string;
  final_urls?: string[];
  cost: number;
  clicks: number;
  impressions: number;
  conversions?: number;
}>) {
  const campaignChannelMap = new Map<string, {
    campaign_id: string;
    campaign_name?: string;
    channel_ids: string[];
    cost: number;
    clicks: number;
    impressions: number;
    conversions?: number;
  }>();

  console.log(`[CHANNEL_MAPPER] Processing ${campaigns.length} campaigns for channel mapping`);

  let campaignsWithChannels = 0;
  let totalCostIn = 0;

  campaigns.forEach(campaign => {
    totalCostIn += campaign.cost || 0;

    // Extract channel IDs from final URLs
    let channelIds: string[] = [];

    if (campaign.final_urls && campaign.final_urls.length > 0) {
      campaign.final_urls.forEach(url => {
        const extractedIds = extractChannelIdsFromUrl(url);
        channelIds.push(...extractedIds);
      });
    }

    // Remove duplicates
    channelIds = [...new Set(channelIds)];

    if (channelIds.length > 0) {
      campaignsWithChannels++;
    }

    campaignChannelMap.set(campaign.campaign_id, {
      campaign_id: campaign.campaign_id,
      campaign_name: campaign.campaign_name,
      channel_ids: channelIds,
      cost: campaign.cost || 0,
      clicks: campaign.clicks || 0,
      impressions: campaign.impressions || 0,
      conversions: campaign.conversions,
    });
  });

  const totalCostOut = Array.from(campaignChannelMap.values()).reduce((sum, c) => sum + c.cost, 0);

  console.log(`[CHANNEL_MAPPER] Mapped ${campaignChannelMap.size} campaigns: ${campaignsWithChannels} with channels, ${campaignChannelMap.size - campaignsWithChannels} without channels`);
  console.log(`[CHANNEL_MAPPER] Cost preserved: $${totalCostIn.toFixed(2)} in → $${totalCostOut.toFixed(2)} out`);

  return campaignChannelMap;
}

/**
 * Combine Google Ads cost data with Predicto revenue data
 */
export function combineGoogleAdsAndPredictoData(
  googleAdsCampaigns: Array<{
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
    campaign_id?: string;
    revenue: number;
    clicks?: number;
    impressions?: number;
    date?: string;
  }>
) {
  // Build channel-to-revenue map
  const channelRevenueMap = new Map<string, {
    revenue: number;
    predicto_clicks: number;
    predicto_impressions: number;
  }>();

  predictoRevenue.forEach(record => {
    const channelId = record.custom_channel_id || record.campaign_id || 'unknown';

    if (!channelRevenueMap.has(channelId)) {
      channelRevenueMap.set(channelId, {
        revenue: 0,
        predicto_clicks: 0,
        predicto_impressions: 0,
      });
    }

    const channel = channelRevenueMap.get(channelId)!;
    channel.revenue += record.revenue || 0;
    channel.predicto_clicks += record.clicks || 0;
    channel.predicto_impressions += record.impressions || 0;
  });

  // Map campaigns to channels
  const campaignChannelMap = mapCampaignsToChannels(googleAdsCampaigns);

  // Combine data
  const combined: Array<{
    campaign_id: string;
    campaign_name?: string;
    channel_ids: string[];
    cost: number;
    revenue: number;
    profit: number;
    roi: number;
    roas: number;
    clicks: number;
    impressions: number;
    conversions?: number;
    ctr: number;
    rpc: number;
    has_cost_data: boolean;
    has_revenue_data: boolean;
  }> = [];

  // Add campaigns with cost data
  campaignChannelMap.forEach((campaignData) => {
    let totalRevenue = 0;

    // Sum revenue from all associated channels
    campaignData.channel_ids.forEach(channelId => {
      const revenueData = channelRevenueMap.get(channelId);
      if (revenueData) {
        totalRevenue += revenueData.revenue;
      }
    });

    const cost = campaignData.cost;
    const profit = totalRevenue - cost;
    const roi = cost > 0 ? ((totalRevenue - cost) / cost) * 100 : 0;
    const roas = cost > 0 ? totalRevenue / cost : 0;
    const rpc = campaignData.clicks > 0 ? totalRevenue / campaignData.clicks : 0;
    const ctr = campaignData.impressions > 0 ? (campaignData.clicks / campaignData.impressions) * 100 : 0;

    combined.push({
      campaign_id: campaignData.campaign_id,
      campaign_name: campaignData.campaign_name,
      channel_ids: campaignData.channel_ids,
      cost,
      revenue: totalRevenue,
      profit,
      roi,
      roas,
      clicks: campaignData.clicks,
      impressions: campaignData.impressions,
      conversions: campaignData.conversions,
      ctr,
      rpc,
      has_cost_data: cost > 0,
      has_revenue_data: totalRevenue > 0,
    });
  });

  // Add channels that have revenue but no cost data (orphaned channels)
  channelRevenueMap.forEach((revenueData, channelId) => {
    // Check if this channel is already associated with a campaign
    const isAssigned = Array.from(campaignChannelMap.values()).some(
      campaign => campaign.channel_ids.includes(channelId)
    );

    if (!isAssigned && revenueData.revenue > 0) {
      combined.push({
        campaign_id: channelId,
        campaign_name: `Channel ${channelId}`,
        channel_ids: [channelId],
        cost: 0,
        revenue: revenueData.revenue,
        profit: revenueData.revenue,
        roi: 0,
        roas: 0,
        clicks: revenueData.predicto_clicks,
        impressions: revenueData.predicto_impressions,
        ctr: revenueData.predicto_impressions > 0
          ? (revenueData.predicto_clicks / revenueData.predicto_impressions) * 100
          : 0,
        rpc: revenueData.predicto_clicks > 0
          ? revenueData.revenue / revenueData.predicto_clicks
          : 0,
        has_cost_data: false,
        has_revenue_data: true,
      });
    }
  });

  // Sort by profit descending
  combined.sort((a, b) => b.profit - a.profit);

  return combined;
}

/**
 * Calculate summary statistics
 */
export function calculateSummary(combinedData: ReturnType<typeof combineGoogleAdsAndPredictoData>) {
  const summary = {
    total_campaigns: combinedData.length,
    campaigns_with_cost: combinedData.filter(c => c.has_cost_data).length,
    campaigns_with_revenue: combinedData.filter(c => c.has_revenue_data).length,
    campaigns_matched: combinedData.filter(c => c.has_cost_data && c.has_revenue_data).length,
    total_cost: combinedData.reduce((sum, c) => sum + c.cost, 0),
    total_revenue: combinedData.reduce((sum, c) => sum + c.revenue, 0),
    total_profit: 0,
    average_roi: 0,
    average_roas: 0,
    total_clicks: combinedData.reduce((sum, c) => sum + c.clicks, 0),
    total_impressions: combinedData.reduce((sum, c) => sum + c.impressions, 0),
    total_conversions: combinedData.reduce((sum, c) => sum + (c.conversions || 0), 0),
    profitable_campaigns: combinedData.filter(c => c.profit > 0).length,
    unprofitable_campaigns: combinedData.filter(c => c.profit < 0 && c.has_cost_data).length,
    match_rate: 0,
  };

  summary.total_profit = summary.total_revenue - summary.total_cost;
  summary.average_roi = summary.total_cost > 0
    ? ((summary.total_revenue - summary.total_cost) / summary.total_cost) * 100
    : 0;
  summary.average_roas = summary.total_cost > 0 ? summary.total_revenue / summary.total_cost : 0;
  summary.match_rate = summary.total_campaigns > 0
    ? (summary.campaigns_matched / summary.total_campaigns) * 100
    : 0;

  return summary;
}
