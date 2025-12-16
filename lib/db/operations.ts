/**
 * MongoDB CRUD Operations
 * Implements all database operations with error handling and retry logic
 */

import { getCollection } from './mongodb';
import {
  FeedType,
  CostDocument,
  RevenueDocument,
  SyncStatusDocument,
  SyncHistoryDocument,
  SaveCostInput,
  SaveRevenueInput,
  getCollectionNames,
  COLLECTION_NAMES,
} from './types';

// ==================== SAVE COST DATA ====================

/**
 * Save cost data to MongoDB with upsert (prevents duplicates)
 * Returns number of documents inserted/updated
 */
export async function saveCost(
  costs: SaveCostInput[],
  feedType: FeedType
): Promise<{ inserted: number; updated: number; errors: number }> {
  if (costs.length === 0) {
    console.log(`[DB] No cost data to save for ${feedType}`);
    return { inserted: 0, updated: 0, errors: 0 };
  }

  const collectionName = getCollectionNames(feedType).cost;
  const collection = await getCollection<CostDocument>(collectionName);

  console.log(`[DB] Saving ${costs.length} cost records to ${collectionName}...`);

  // Prepare documents
  const documents: CostDocument[] = costs.map((cost) => ({
    account_id: cost.account_id,
    campaign_id: cost.campaign_id,
    campaign_name: cost.campaign_name,
    ad_group_id: cost.ad_group_id,
    ad_group_name: cost.ad_group_name,
    ad_id: cost.ad_id,
    ad_name: cost.ad_name,
    date: cost.date,
    cost_micros: cost.cost_micros,
    clicks: cost.clicks,
    impressions: cost.impressions,
    conversions: cost.conversions,
    ctr: cost.ctr,
    cpc: cost.cpc,
    style_id: cost.style_id,
    domain: cost.domain,
    gclid: cost.gclid,
    article: cost.article,
    tkid: cost.tkid,
    feed_type: feedType,
    created_at: new Date(),
    updated_at: new Date(),
  }));

  // Build bulk operations with proper filters based on feed type
  const operations = documents.map((doc) => {
    let filter: any;

    // Create unique filter based on feed type
    switch (feedType) {
      case 'afs':
        filter = {
          account_id: doc.account_id,
          date: doc.date,
          style_id: doc.style_id,
          campaign_id: doc.campaign_id,
        };
        break;
      case 'compado':
        filter = {
          account_id: doc.account_id,
          date: doc.date,
          gclid: doc.gclid,
          campaign_id: doc.campaign_id,
        };
        break;
      case 'adscom':
        filter = {
          account_id: doc.account_id,
          date: doc.date,
          article: doc.article,
          campaign_id: doc.campaign_id,
        };
        break;
      case 'inuvo':
        filter = {
          account_id: doc.account_id,
          date: doc.date,
          tkid: doc.tkid,
          campaign_id: doc.campaign_id,
        };
        break;
      default:
        filter = {
          account_id: doc.account_id,
          date: doc.date,
          campaign_id: doc.campaign_id,
        };
    }

    return {
      updateOne: {
        filter,
        update: {
          $set: doc,
          $setOnInsert: { created_at: new Date() },
        },
        upsert: true,
      },
    };
  });

  try {
    // Execute bulk write (ordered: false allows all to complete even if some fail)
    const result = await collection.bulkWrite(operations, { ordered: false });

    const inserted = result.upsertedCount;
    const updated = result.modifiedCount;

    console.log(`[DB] ✓ Cost data saved to ${collectionName}:`);
    console.log(`[DB]   Inserted: ${inserted}`);
    console.log(`[DB]   Updated: ${updated}`);

    return { inserted, updated, errors: 0 };
  } catch (error: any) {
    // Handle bulk write errors
    if (error.code === 11000) {
      console.warn(`[DB] ⚠️  Duplicate key errors in ${collectionName} (expected with upserts)`);
      return { inserted: 0, updated: 0, errors: error.writeErrors?.length || 0 };
    }

    console.error(`[DB] ✗ Error saving cost data to ${collectionName}:`, error.message);
    throw error;
  }
}

// ==================== SAVE REVENUE DATA ====================

/**
 * Save revenue data to MongoDB with upsert
 */
export async function saveRevenue(
  revenues: SaveRevenueInput[],
  feedType: FeedType
): Promise<{ inserted: number; updated: number; errors: number }> {
  if (revenues.length === 0) {
    console.log(`[DB] No revenue data to save for ${feedType}`);
    return { inserted: 0, updated: 0, errors: 0 };
  }

  const collectionName = getCollectionNames(feedType).revenue;
  const collection = await getCollection<RevenueDocument>(collectionName);

  console.log(`[DB] Saving ${revenues.length} revenue records to ${collectionName}...`);

  // Prepare documents
  const documents: RevenueDocument[] = revenues.map((rev) => ({
    revenue_usd: rev.revenue_usd,
    revenue_eur: rev.revenue_eur,
    clicks: rev.clicks,
    impressions: rev.impressions,
    date: rev.date,
    style_id: rev.style_id,
    domain: rev.domain,
    country_name: rev.country_name,
    gclid: rev.gclid,
    article: rev.article,
    tkid: rev.tkid,
    srcclkid: rev.srcclkid,
    conversion_type: rev.conversion_type,
    device: rev.device,
    country: rev.country,
    traffic_source: rev.traffic_source,
    keywords: rev.keywords,
    agid: rev.agid,
    platform_type: rev.platform_type,
    ad_requests: rev.ad_requests,
    page_views: rev.page_views,
    estimated_clicks: rev.estimated_clicks,
    visits: rev.visits,
    ctr: rev.ctr,
    rpm: rev.rpm,
    epc: rev.epc,
    ivt_correction: rev.ivt_correction,
    finalized: rev.finalized,
    feed_type: feedType,
    created_at: new Date(),
    updated_at: new Date(),
  }));

  const operations = documents.map((doc) => {
    let filter: any;

    switch (feedType) {
      case 'afs':
        filter = {
          style_id: doc.style_id,
          date: doc.date,
          country_name: doc.country_name,
        };
        break;
      case 'compado':
        filter = {
          gclid: doc.gclid,
          date: doc.date,
        };
        break;
      case 'adscom':
        filter = {
          article: doc.article,
          date: doc.date,
        };
        break;
      case 'inuvo':
        filter = {
          tkid: doc.tkid,
          date: doc.date,
        };
        break;
      default:
        filter = {
          date: doc.date,
        };
    }

    return {
      updateOne: {
        filter,
        update: {
          $set: doc,
          $setOnInsert: { created_at: new Date() },
        },
        upsert: true,
      },
    };
  });

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });

    const inserted = result.upsertedCount;
    const updated = result.modifiedCount;

    console.log(`[DB] ✓ Revenue data saved to ${collectionName}:`);
    console.log(`[DB]   Inserted: ${inserted}`);
    console.log(`[DB]   Updated: ${updated}`);

    return { inserted, updated, errors: 0 };
  } catch (error: any) {
    if (error.code === 11000) {
      console.warn(`[DB] ⚠️  Duplicate key errors in ${collectionName}`);
      return { inserted: 0, updated: 0, errors: error.writeErrors?.length || 0 };
    }

    console.error(`[DB] ✗ Error saving revenue data to ${collectionName}:`, error.message);
    throw error;
  }
}

// ==================== QUERY OPERATIONS ====================

/**
 * Get cost data for a date range
 */
export async function getCost(
  feedType: FeedType,
  startDate: string,
  endDate: string,
  accountId?: string | null
): Promise<CostDocument[]> {
  const collectionName = getCollectionNames(feedType).cost;
  const collection = await getCollection<CostDocument>(collectionName);

  const filter: any = {
    feed_type: feedType,
    date: { $gte: startDate, $lte: endDate },
  };

  if (accountId) {
    filter.account_id = accountId;
  }

  console.log(`[DB] Querying ${collectionName}: ${startDate} to ${endDate}${accountId ? `, account: ${accountId}` : ''}`);

  const results = await collection
    .find(filter)
    .sort({ date: -1, account_id: 1 })
    .toArray();

  console.log(`[DB] ✓ Found ${results.length} cost records`);

  return results;
}

/**
 * Get revenue data for a date range
 */
export async function getRevenue(
  feedType: FeedType,
  startDate: string,
  endDate: string,
  accountId?: string | null
): Promise<RevenueDocument[]> {
  const collectionName = getCollectionNames(feedType).revenue;
  const collection = await getCollection<RevenueDocument>(collectionName);

  const filter: any = {
    feed_type: feedType,
    date: { $gte: startDate, $lte: endDate },
  };

  console.log(`[DB] Querying ${collectionName}: ${startDate} to ${endDate}`);

  const results = await collection
    .find(filter)
    .sort({ date: -1 })
    .toArray();

  console.log(`[DB] ✓ Found ${results.length} revenue records`);

  return results;
}

/**
 * Check if data exists for a specific date range
 */
export async function hasData(
  feedType: FeedType,
  startDate: string,
  endDate: string,
  accountId?: string | null
): Promise<boolean> {
  const collectionName = getCollectionNames(feedType).cost;
  const collection = await getCollection<CostDocument>(collectionName);

  const filter: any = {
    feed_type: feedType,
    date: { $gte: startDate, $lte: endDate },
  };

  if (accountId) {
    filter.account_id = accountId;
  }

  const count = await collection.countDocuments(filter, { limit: 1 });
  return count > 0;
}

// ==================== SYNC STATUS OPERATIONS ====================

/**
 * Update sync status for an account
 */
export async function updateSyncStatus(
  feedType: FeedType,
  accountId: string,
  status: 'success' | 'failed' | 'in_progress' | 'skipped',
  errorMessage?: string,
  recordsSynced?: number,
  durationMs?: number
): Promise<void> {
  const collection = await getCollection<SyncStatusDocument>(COLLECTION_NAMES.shared.syncStatus);

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  await collection.updateOne(
    { feed_type: feedType, account_id: accountId },
    {
      $set: {
        feed_type: feedType,
        account_id: accountId,
        last_sync_date: status === 'success' ? today : undefined,
        last_sync_time: now,
        status,
        error_message: errorMessage,
        records_synced: recordsSynced || 0,
        duration_ms: durationMs || 0,
        updated_at: now,
      },
    },
    { upsert: true }
  );

  console.log(`[DB] Updated sync status for ${feedType}/${accountId}: ${status}`);
}

/**
 * Get sync status for all accounts of a feed type
 */
export async function getSyncStatus(feedType?: FeedType): Promise<SyncStatusDocument[]> {
  const collection = await getCollection<SyncStatusDocument>(COLLECTION_NAMES.shared.syncStatus);

  const filter: any = feedType ? { feed_type: feedType } : {};

  const results = await collection
    .find(filter)
    .sort({ last_sync_time: -1 })
    .toArray();

  return results;
}

/**
 * Record sync history (audit log)
 */
export async function recordSyncHistory(
  feedType: FeedType,
  accountId: string | null,
  syncDate: string,
  status: 'success' | 'failed' | 'partial',
  recordsCost: number,
  recordsRevenue: number,
  durationMs: number,
  errors?: string[]
): Promise<void> {
  const collection = await getCollection<SyncHistoryDocument>(COLLECTION_NAMES.shared.syncHistory);

  await collection.insertOne({
    feed_type: feedType,
    account_id: accountId,
    sync_date: syncDate,
    sync_time: new Date(),
    status,
    records_cost: recordsCost,
    records_revenue: recordsRevenue,
    duration_ms: durationMs,
    errors,
    created_at: new Date(),
  });

  console.log(`[DB] Recorded sync history for ${feedType}${accountId ? `/${accountId}` : ''}: ${status}`);
}

// ==================== DATA VALIDATION ====================

/**
 * Verify data consistency (individual totals vs overall totals)
 */
export async function verifyDataConsistency(
  feedType: FeedType,
  date: string
): Promise<{
  valid: boolean;
  difference: number;
  individualTotal: number;
  overallTotal: number;
}> {
  const collectionName = getCollectionNames(feedType).cost;
  const collection = await getCollection<CostDocument>(collectionName);

  // Get individual account totals
  const individualTotals = await collection
    .aggregate([
      { $match: { feed_type: feedType, date: date } },
      {
        $group: {
          _id: '$account_id',
          total_cost: { $sum: '$cost_micros' },
        },
      },
    ])
    .toArray();

  // Get overall total
  const overallResult = await collection
    .aggregate([
      { $match: { feed_type: feedType, date: date } },
      {
        $group: {
          _id: null,
          total_cost: { $sum: '$cost_micros' },
        },
      },
    ])
    .toArray();

  const individualTotal = individualTotals.reduce((sum, acc: any) => sum + acc.total_cost, 0);
  const overallTotal = overallResult[0]?.total_cost || 0;
  const difference = Math.abs(individualTotal - overallTotal);

  // Allow $0.01 rounding error (100 micros)
  const valid = difference <= 100;

  if (!valid) {
    console.error(`[DB] ✗ Data inconsistency for ${feedType} on ${date}:`);
    console.error(`[DB]   Individual sum: ${individualTotal}, Overall: ${overallTotal}`);
  } else {
    console.log(`[DB] ✓ Data consistent for ${feedType} on ${date}`);
  }

  return { valid, difference, individualTotal, overallTotal };
}

/**
 * Delete old data (for cleanup/archival)
 */
export async function deleteOldData(
  feedType: FeedType,
  beforeDate: string
): Promise<{ costDeleted: number; revenueDeleted: number }> {
  const { cost: costCollection, revenue: revenueCollection } = getCollectionNames(feedType);

  const costColl = await getCollection<CostDocument>(costCollection);
  const revenueColl = await getCollection<RevenueDocument>(revenueCollection);

  const filter = {
    feed_type: feedType,
    date: { $lt: beforeDate },
  };

  const costResult = await costColl.deleteMany(filter);
  const revenueResult = await revenueColl.deleteMany(filter);

  console.log(`[DB] Deleted old data for ${feedType} before ${beforeDate}:`);
  console.log(`[DB]   Cost records: ${costResult.deletedCount}`);
  console.log(`[DB]   Revenue records: ${revenueResult.deletedCount}`);

  return {
    costDeleted: costResult.deletedCount,
    revenueDeleted: revenueResult.deletedCount,
  };
}
