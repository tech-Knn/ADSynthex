// lib/db/dashboard-helper.ts
// Helper functions for dashboard APIs to read from MongoDB first

import { getCollection } from './mongodb';
import { FeedType, getCollectionNames } from './types';

/**
 * Get dashboard data from MongoDB
 * Returns data if fresh (< maxAgeMinutes), otherwise null
 */
export async function getDashboardFromMongoDB(
  feedType: FeedType,
  accountId: string | string[],
  startDate: string,
  endDate: string,
  maxAgeMinutes: number = 30
): Promise<{ data: any; source: string; age: number } | null> {
  try {
    const collections = getCollectionNames(feedType);

    // Get cost-revenue mappings
    const mappingCollection = await getCollection(collections.costRevenueMapping);

    const query: any = {
      feed_type: feedType,
      date: { $gte: startDate, $lte: endDate }
    };

    // Handle single account or multiple accounts
    if (Array.isArray(accountId)) {
      query.account_id = { $in: accountId };
    } else if (accountId !== 'all') {
      query.account_id = accountId;
    }

    const mappings = await mappingCollection
      .find(query)
      .sort({ date: -1 })
      .toArray();

    if (mappings.length === 0) {
      console.log(`[MONGODB_HELPER] No mappings found for ${feedType}`);
      return null;
    }

    // Check data age from created_at timestamp
    const latestMapping = mappings[0];
    const dataAge = Date.now() - new Date(latestMapping.created_at).getTime();
    const ageMinutes = Math.round(dataAge / 60000);

    console.log(`[MONGODB_HELPER] Found ${mappings.length} mappings, age: ${ageMinutes} min`);

    // Return null if data is too old
    if (ageMinutes > maxAgeMinutes) {
      console.log(`[MONGODB_HELPER] Data too old (${ageMinutes} > ${maxAgeMinutes} min)`);
      return null;
    }

    // Get campaign aggregated data
    const campaignsCollection = await getCollection(collections.campaigns);

    const campaignsQuery: any = {
      'date': { $gte: startDate, $lte: endDate },
      'feed_type': feedType
    };

    // Handle single account or multiple accounts
    if (Array.isArray(accountId)) {
      campaignsQuery['account_id'] = { $in: accountId };
    } else if (accountId !== 'all') {
      campaignsQuery['account_id'] = accountId;
    }

    const campaigns = await campaignsCollection
      .find(campaignsQuery)
      .toArray();

    console.log(`[MONGODB_HELPER] Found ${campaigns.length} aggregated campaigns`);

    // Format campaign aggregated data
    const campaignAggregated = campaigns.map((c: any) => ({
      campaign_id: c.campaign_id,
      campaign_name: c.campaign_name,
      account_id: c.account_id,
      date: c.date,
      style_id: c.style_id,
      domain: c.domain,
      article: c.article,
      tkid: c.tkid,
      cost: c.cost_usd || 0,
      revenue: c.revenue_usd || 0,
      profit: c.profit_usd || 0,
      clicks: c.clicks || 0,
      impressions: c.impressions || 0,
      conversions: c.conversions || 0,
      costClicks: c.cost_clicks || 0,
      cpa: c.cpa || 0,
      conversionRate: c.conversion_rate || 0,
      rpc: c.rpc || 0,
      roi: c.roi || 0,
      roas: c.roas || 0
    }));

    // Format data for dashboard
    const formattedData = {
      cost_revenue_mapping: mappings.map((m: any) => ({
        ...m,
        _id: m._id.toString() // Convert ObjectId to string
      })),
      campaign_aggregated: campaignAggregated,
      summary: {
        totalCost: mappings.reduce((sum: number, m: any) => sum + (m.cost_usd || 0), 0),
        totalRevenue: mappings.reduce((sum: number, m: any) => sum + (m.revenue_usd || 0), 0),
        totalProfit: mappings.reduce((sum: number, m: any) => sum + (m.profit_usd || 0), 0),
        totalClicks: mappings.reduce((sum: number, m: any) => sum + (m.cost_clicks || 0), 0),
        totalImpressions: mappings.reduce((sum: number, m: any) => sum + (m.impressions || 0), 0),
      }
    };

    return {
      data: formattedData,
      source: 'mongodb',
      age: ageMinutes
    };

  } catch (error: any) {
    console.error('[MONGODB_HELPER] Error:', error);
    return null;
  }
}
