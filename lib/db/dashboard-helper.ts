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

    // Format data for dashboard
    const formattedData = {
      cost_revenue_mapping: mappings.map((m: any) => ({
        ...m,
        _id: m._id.toString() // Convert ObjectId to string
      })),
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
