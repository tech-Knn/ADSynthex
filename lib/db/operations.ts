// lib/db/operations.ts
// Database Operations - Repository Pattern
import { getCollection } from './mongodb';
import {
  FeedType,
  ClickDocument,
  RevenueDocument,
  CostRevenueMappingDocument,
  CampaignDocument,
  DailyMetricsDocument,
  SyncStatusDocument,
  SaveClicksInput,
  SaveRevenueInput,
  getCollectionNames,
  SHARED_COLLECTIONS
} from './types';

// ==================== SAVE CLICKS (Google Ads Cost Data) ====================

export async function saveClicks(
  clicks: SaveClicksInput[],
  feedType: FeedType
): Promise<number> {
  if (clicks.length === 0) {
    console.log(`[DB] No clicks to save for ${feedType}`);
    return 0;
  }

  const collectionName = getCollectionNames(feedType).clicks;
  const collection = await getCollection(collectionName);

  const documents: ClickDocument[] = clicks.map(click => ({
    account_id: click.account_id,
    gclid: click.gclid,
    campaign_id: click.campaign_id,
    campaign_name: click.campaign_name,
    ad_group_id: click.ad_group_id,
    ad_group_name: click.ad_group_name,
    ad_id: click.ad_id,
    ad_name: click.ad_name,
    date: click.date,
    cost_micros: click.cost_micros,
    clicks: click.clicks || 1,
    impressions: click.impressions,
    feed_type: feedType,
    created_at: new Date()
  }));

  const operations = documents.map(doc => ({
    updateOne: {
      filter: { gclid: doc.gclid, date: doc.date, feed_type: feedType },
      update: { $set: doc },
      upsert: true
    }
  }));

  const result = await collection.bulkWrite(operations, { ordered: false });
  const savedCount = result.upsertedCount + result.modifiedCount;

  console.log(`[DB] Saved ${savedCount} clicks to ${collectionName}`);
  return savedCount;
}

// ==================== SAVE REVENUE DATA ====================

export async function saveRevenue(
  revenues: SaveRevenueInput[],
  feedType: FeedType
): Promise<number> {
  if (revenues.length === 0) {
    console.log(`[DB] No revenue to save for ${feedType}`);
    return 0;
  }

  const collectionName = getCollectionNames(feedType).revenue;
  const collection = await getCollection(collectionName);

  const documents: RevenueDocument[] = revenues.map(rev => ({
    gclid: rev.gclid,
    revenue_usd: rev.revenue_usd,
    revenue_eur: rev.revenue_eur,
    date: rev.date,
    domain: rev.domain,
    article_id: rev.article_id,
    conversion_type: rev.conversion_type,
    feed_type: feedType,
    created_at: new Date()
  }));

  const operations = documents.map(doc => ({
    updateOne: {
      filter: { gclid: doc.gclid, date: doc.date, feed_type: feedType },
      update: { $set: doc },
      upsert: true
    }
  }));

  const result = await collection.bulkWrite(operations, { ordered: false });
  const savedCount = result.upsertedCount + result.modifiedCount;

  console.log(`[DB] Saved ${savedCount} revenue records to ${collectionName}`);
  return savedCount;
}

// ==================== CREATE COST-REVENUE MAPPING ====================

export async function createCostRevenueMapping(
  feedType: FeedType,
  startDate: string,
  endDate: string
): Promise<number> {
  const clicksCollection = await getCollection(getCollectionNames(feedType).clicks);
  const mappingCollection = await getCollection(getCollectionNames(feedType).costRevenueMapping);

  console.log(`[DB] Creating cost-revenue mapping for ${feedType} (${startDate} to ${endDate})...`);

  // MongoDB aggregation pipeline to join clicks with revenue
  // AFS uses style_id + domain matching, others use GCLID matching
  const lookupPipeline = feedType === 'afs'
    ? {
        $lookup: {
          from: getCollectionNames(feedType).revenue,
          let: { click_style_id: '$style_id', click_domain: '$domain', click_date: '$date' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$style_id', '$$click_style_id'] },
                    { $eq: ['$domain', '$$click_domain'] },
                    { $eq: ['$date', '$$click_date'] },
                    { $eq: ['$feed_type', feedType] }
                  ]
                }
              }
            }
          ],
          as: 'revenue_data'
        }
      }
    : {
        $lookup: {
          from: getCollectionNames(feedType).revenue,
          let: { click_gclid: '$gclid', click_date: '$date' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$gclid', '$$click_gclid'] },
                    { $eq: ['$date', '$$click_date'] },
                    { $eq: ['$feed_type', feedType] }
                  ]
                }
              }
            }
          ],
          as: 'revenue_data'
        }
      };

  const pipeline = [
    {
      $match: {
        date: { $gte: startDate, $lte: endDate },
        feed_type: feedType
      }
    },
    lookupPipeline,
    {
      $unwind: {
        path: '$revenue_data',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        account_id: 1,
        gclid: 1,
        style_id: 1, // For AFS
        campaign_id: 1,
        campaign_name: 1,
        ad_group_id: 1,
        ad_group_name: 1,
        ad_id: 1,
        ad_name: 1,
        date: 1,
        cost_usd: { $divide: ['$cost_micros', 1000000] },
        revenue_usd: { $ifNull: ['$revenue_data.revenue_usd', 0] },
        revenue_eur: { $ifNull: ['$revenue_data.revenue_eur', 0] },
        domain: { $ifNull: ['$revenue_data.domain', '$domain'] }, // Use click domain if revenue domain not found
        article_id: { $ifNull: ['$revenue_data.article_id', null] },
        profit_usd: {
          $subtract: [
            { $ifNull: ['$revenue_data.revenue_usd', 0] },
            { $divide: ['$cost_micros', 1000000] }
          ]
        },
        roi: {
          $cond: {
            if: { $eq: ['$cost_micros', 0] },
            then: 0,
            else: {
              $multiply: [
                {
                  $divide: [
                    {
                      $subtract: [
                        { $ifNull: ['$revenue_data.revenue_usd', 0] },
                        { $divide: ['$cost_micros', 1000000] }
                      ]
                    },
                    { $divide: ['$cost_micros', 1000000] }
                  ]
                },
                100
              ]
            }
          }
        },
        feed_type: { $literal: feedType },
        created_at: { $literal: new Date() },
        updated_at: { $literal: new Date() }
      }
    }
  ];

  const mappings = await clicksCollection.aggregate(pipeline).toArray();

  if (mappings.length > 0) {
    const operations = mappings.map((mapping: any) => {
      // For AFS: use style_id + domain + date as unique key
      // For others: use gclid + date as unique key
      const filter = feedType === 'afs'
        ? { style_id: mapping.style_id, domain: mapping.domain, date: mapping.date, feed_type: feedType }
        : { gclid: mapping.gclid, date: mapping.date, feed_type: feedType };

      return {
        updateOne: {
          filter,
          update: { $set: mapping },
          upsert: true
        }
      };
    });

    const result = await mappingCollection.bulkWrite(operations, { ordered: false });
    const savedCount = result.upsertedCount + result.modifiedCount;
    console.log(`[DB] ✓ Created ${savedCount} cost-revenue mappings for ${feedType}`);
    return savedCount;
  }

  return 0;
}

// ==================== AGGREGATE CAMPAIGNS ====================

export async function aggregateCampaigns(
  feedType: FeedType,
  startDate: string,
  endDate: string
): Promise<number> {
  const mappingCollection = await getCollection(getCollectionNames(feedType).costRevenueMapping);
  const campaignsCollection = await getCollection(getCollectionNames(feedType).campaigns);

  console.log(`[DB] Aggregating campaigns for ${feedType} (${startDate} to ${endDate})...`);

  const pipeline = [
    {
      $match: {
        date: { $gte: startDate, $lte: endDate },
        feed_type: feedType
      }
    },
    {
      $group: {
        _id: {
          account_id: '$account_id',
          campaign_id: '$campaign_id',
          campaign_name: '$campaign_name',
          date: '$date'
        },
        clicks: { $sum: 1 },
        cost_usd: { $sum: '$cost_usd' },
        revenue_usd: { $sum: '$revenue_usd' },
        revenue_eur: { $sum: '$revenue_eur' },
        profit_usd: { $sum: '$profit_usd' }
      }
    },
    {
      $project: {
        account_id: '$_id.account_id',
        campaign_id: '$_id.campaign_id',
        campaign_name: '$_id.campaign_name',
        date: '$_id.date',
        clicks: 1,
        cost_usd: 1,
        revenue_usd: 1,
        revenue_eur: 1,
        profit_usd: 1,
        roi: {
          $cond: {
            if: { $eq: ['$cost_usd', 0] },
            then: 0,
            else: { $multiply: [{ $divide: ['$profit_usd', '$cost_usd'] }, 100] }
          }
        },
        feed_type: { $literal: feedType },
        created_at: { $literal: new Date() },
        updated_at: { $literal: new Date() }
      }
    }
  ];

  const campaigns = await mappingCollection.aggregate(pipeline).toArray();

  if (campaigns.length > 0) {
    const operations = campaigns.map((campaign: any) => ({
      updateOne: {
        filter: {
          account_id: campaign.account_id,
          campaign_id: campaign.campaign_id,
          date: campaign.date,
          feed_type: feedType
        },
        update: { $set: campaign },
        upsert: true
      }
    }));

    const result = await campaignsCollection.bulkWrite(operations, { ordered: false });
    const savedCount = result.upsertedCount + result.modifiedCount;
    console.log(`[DB] ✓ Aggregated ${savedCount} campaigns for ${feedType}`);
    return savedCount;
  }

  return 0;
}

// ==================== GET DASHBOARD DATA ====================

export async function getDashboardCampaigns(
  feedType: FeedType,
  accountId: string | 'all',
  startDate: string,
  endDate: string
): Promise<any[]> {
  const campaignsCollection = await getCollection(getCollectionNames(feedType).campaigns);

  const filter: any = {
    date: { $gte: startDate, $lte: endDate },
    feed_type: feedType
  };

  if (accountId !== 'all') {
    filter.account_id = accountId;
  }

  // Aggregate campaigns across date range
  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: {
          campaign_id: '$campaign_id',
          campaign_name: '$campaign_name',
          account_id: '$account_id'
        },
        clicks: { $sum: '$clicks' },
        cost_usd: { $sum: '$cost_usd' },
        revenue_usd: { $sum: '$revenue_usd' },
        revenue_eur: { $sum: '$revenue_eur' },
        profit_usd: { $sum: '$profit_usd' }
      }
    },
    {
      $project: {
        campaign_id: '$_id.campaign_id',
        campaign_name: '$_id.campaign_name',
        account_id: '$_id.account_id',
        clicks: 1,
        cost_usd: 1,
        revenue_usd: 1,
        revenue_eur: 1,
        profit_usd: 1,
        roi: {
          $cond: {
            if: { $eq: ['$cost_usd', 0] },
            then: 0,
            else: { $multiply: [{ $divide: ['$profit_usd', '$cost_usd'] }, 100] }
          }
        }
      }
    },
    { $sort: { cost_usd: -1 } }
  ];

  const campaigns = await campaignsCollection.aggregate(pipeline).toArray();

  console.log(`[DB] Retrieved ${campaigns.length} campaigns for ${feedType} (${accountId})`);
  return campaigns;
}

// ==================== UPDATE SYNC STATUS ====================

export async function updateSyncStatus(
  feedType: FeedType,
  accountId: string,
  status: 'success' | 'failed' | 'in_progress',
  errorMessage?: string,
  metrics?: { clicks_synced?: number; revenue_records_synced?: number; mappings_created?: number }
): Promise<void> {
  const collection = await getCollection(SHARED_COLLECTIONS.syncStatus);

  const document: Partial<SyncStatusDocument> = {
    feed_type: feedType,
    account_id: accountId,
    last_sync_time: new Date(),
    last_sync_date: new Date().toISOString().split('T')[0],
    status,
    error_message: errorMessage,
    ...metrics,
    updated_at: new Date()
  };

  await collection.updateOne(
    { feed_type: feedType, account_id: accountId },
    { $set: document, $setOnInsert: { created_at: new Date() } },
    { upsert: true }
  );
}

// ==================== GET SYNC STATUS ====================

export async function getSyncStatus(feedType?: FeedType): Promise<SyncStatusDocument[]> {
  const collection = await getCollection(SHARED_COLLECTIONS.syncStatus);

  const filter = feedType ? { feed_type: feedType } : {};
  const statuses = await collection
    .find(filter)
    .sort({ last_sync_time: -1 })
    .toArray() as unknown as SyncStatusDocument[];

  return statuses;
}
