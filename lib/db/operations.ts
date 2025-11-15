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
    campaign_id: click.campaign_id,
    campaign_name: click.campaign_name,
    ad_group_id: click.ad_group_id,
    ad_group_name: click.ad_group_name,
    ad_id: click.ad_id,
    ad_name: click.ad_name,
    date: click.date,

    // Cost metrics
    cost_micros: click.cost_micros,
    clicks: click.clicks || 1,
    impressions: click.impressions,
    conversions: click.conversions,
    ctr: click.ctr,
    cpc: click.cpc,

    // Matching keys by feed
    gclid: click.gclid, // Compado, Inuvo
    style_id: click.style_id, // AFS
    domain: click.domain, // AFS
    article: click.article, // Ads.com
    tkid: click.tkid, // Inuvo

    feed_type: feedType,
    created_at: new Date()
  }));

  const operations = documents.map(doc => {
    // Create unique filter based on feed type
    let filter: any;

    switch (feedType) {
      case 'afs':
        // Match on style_id + date
        filter = { style_id: doc.style_id, date: doc.date, feed_type: feedType };
        break;
      case 'compado':
        // Match on gclid + date
        filter = { gclid: doc.gclid, date: doc.date, feed_type: feedType };
        break;
      case 'adscom':
        // Match on article + date
        filter = { article: doc.article, date: doc.date, feed_type: feedType };
        break;
      case 'inuvo':
        // Match on tkid + date
        filter = { tkid: doc.tkid, date: doc.date, feed_type: feedType };
        break;
      default:
        // Fallback to campaign_id + date
        filter = { campaign_id: doc.campaign_id, date: doc.date, feed_type: feedType };
    }

    return {
      updateOne: {
        filter,
        update: { $set: doc },
        upsert: true
      }
    };
  });

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
    // Revenue metrics
    revenue_usd: rev.revenue_usd,
    revenue_eur: rev.revenue_eur,
    clicks: rev.clicks,
    impressions: rev.impressions,
    date: rev.date,

    // Matching keys by feed
    gclid: rev.gclid, // Compado
    style_id: rev.style_id, // AFS
    domain: rev.domain, // AFS
    article: rev.article, // Ads.com
    tkid: rev.tkid, // Inuvo

    // Feed-specific fields
    country_name: rev.country_name, // AFS
    srcclkid: rev.srcclkid, // Compado
    conversion_type: rev.conversion_type, // Compado
    device: rev.device, // Compado
    country: rev.country, // Compado
    traffic_source: rev.traffic_source, // Compado
    keywords: rev.keywords, // Compado
    agid: rev.agid, // Inuvo
    platform_type: rev.platform_type, // Inuvo
    ad_requests: rev.ad_requests, // Inuvo
    page_views: rev.page_views, // Inuvo
    estimated_clicks: rev.estimated_clicks, // Inuvo
    visits: rev.visits, // Ads.com
    ctr: rev.ctr, // Ads.com
    rpm: rev.rpm, // Ads.com
    epc: rev.epc, // Ads.com
    ivt_correction: rev.ivt_correction, // Ads.com
    finalized: rev.finalized, // Ads.com

    feed_type: feedType,
    created_at: new Date()
  }));

  const operations = documents.map(doc => {
    // Create unique filter based on feed type
    let filter: any;

    switch (feedType) {
      case 'afs':
        // Match on style_id + date
        filter = { style_id: doc.style_id, date: doc.date, feed_type: feedType };
        break;
      case 'compado':
        // Match on gclid + date
        filter = { gclid: doc.gclid, date: doc.date, feed_type: feedType };
        break;
      case 'adscom':
        // Match on article + date
        filter = { article: doc.article, date: doc.date, feed_type: feedType };
        break;
      case 'inuvo':
        // Match on tkid + date
        filter = { tkid: doc.tkid, date: doc.date, feed_type: feedType };
        break;
      default:
        // Fallback to gclid + date
        filter = { gclid: doc.gclid, date: doc.date, feed_type: feedType };
    }

    return {
      updateOne: {
        filter,
        update: { $set: doc },
        upsert: true
      }
    };
  });

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
  // Each feed type has different matching logic
  let lookupPipeline: any;

  switch (feedType) {
    case 'afs':
      // Match on style_id + date
      lookupPipeline = {
        $lookup: {
          from: getCollectionNames(feedType).revenue,
          let: { click_style_id: '$style_id', click_date: '$date' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$style_id', '$$click_style_id'] },
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
      break;

    case 'compado':
      // Match on gclid + date
      lookupPipeline = {
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
      break;

    case 'adscom':
      // Match on article + date
      lookupPipeline = {
        $lookup: {
          from: getCollectionNames(feedType).revenue,
          let: { click_article: '$article', click_date: '$date' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$article', '$$click_article'] },
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
      break;

    case 'inuvo':
      // Match on tkid + date
      lookupPipeline = {
        $lookup: {
          from: getCollectionNames(feedType).revenue,
          let: { click_tkid: '$tkid', click_date: '$date' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$tkid', '$$click_tkid'] },
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
      break;

    default:
      throw new Error(`Unknown feed type: ${feedType}`);
  }

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
        // Identifiers
        account_id: 1,
        campaign_id: 1,
        campaign_name: 1,
        ad_group_id: 1,
        ad_group_name: 1,
        ad_id: 1,
        ad_name: 1,
        date: 1,

        // Matching keys by feed
        gclid: 1, // Compado
        style_id: 1, // AFS
        domain: { $ifNull: ['$revenue_data.domain', '$domain'] }, // AFS
        article: { $ifNull: ['$revenue_data.article', '$article'] }, // Ads.com
        tkid: 1, // Inuvo

        // Cost metrics (from Google Ads)
        cost_usd: { $divide: ['$cost_micros', 1000000] },
        cost_clicks: { $ifNull: ['$clicks', 0] }, // Google Ads clicks
        impressions: { $ifNull: ['$impressions', 0] },
        cost_conversions: { $ifNull: ['$conversions', 0] },
        cpc: { $ifNull: ['$cpc', 0] },
        ctr: { $ifNull: ['$ctr', 0] },

        // Revenue metrics (from revenue APIs)
        revenue_usd: { $ifNull: ['$revenue_data.revenue_usd', 0] },
        revenue_eur: { $ifNull: ['$revenue_data.revenue_eur', 0] },
        revenue_clicks: { $ifNull: ['$revenue_data.clicks', 0] },
        revenue_impressions: { $ifNull: ['$revenue_data.impressions', 0] },

        // Dashboard calculated metrics (CRITICAL!)
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
        roas: {
          $cond: {
            if: { $eq: ['$cost_micros', 0] },
            then: 0,
            else: {
              $divide: [
                { $ifNull: ['$revenue_data.revenue_usd', 0] },
                { $divide: ['$cost_micros', 1000000] }
              ]
            }
          }
        },
        cpa: {
          $cond: {
            if: { $eq: [{ $ifNull: ['$revenue_data.clicks', 0] }, 0] },
            then: 0,
            else: {
              $divide: [
                { $divide: ['$cost_micros', 1000000] },
                { $ifNull: ['$revenue_data.clicks', 0] }
              ]
            }
          }
        },
        conversion_rate: {
          $cond: {
            if: { $eq: [{ $ifNull: ['$clicks', 0] }, 0] },
            then: 0,
            else: {
              $multiply: [
                {
                  $divide: [
                    { $ifNull: ['$revenue_data.clicks', 0] },
                    { $ifNull: ['$clicks', 1] }
                  ]
                },
                100
              ]
            }
          }
        },
        rpc: {
          $cond: {
            if: { $eq: [{ $ifNull: ['$revenue_data.clicks', 0] }, 0] },
            then: 0,
            else: {
              $divide: [
                { $ifNull: ['$revenue_data.revenue_usd', 0] },
                { $ifNull: ['$revenue_data.clicks', 1] }
              ]
            }
          }
        },

        // Feed-specific extra data
        country_name: { $ifNull: ['$revenue_data.country_name', null] }, // AFS
        traffic_source: { $ifNull: ['$revenue_data.traffic_source', null] }, // Compado
        device: { $ifNull: ['$revenue_data.device', null] }, // Compado
        keywords: { $ifNull: ['$revenue_data.keywords', null] }, // Compado
        conversion_type: { $ifNull: ['$revenue_data.conversion_type', null] }, // Compado
        visits: { $ifNull: ['$revenue_data.visits', null] }, // Ads.com
        rpm: { $ifNull: ['$revenue_data.rpm', null] }, // Ads.com
        epc: { $ifNull: ['$revenue_data.epc', null] }, // Ads.com
        ivt_correction: { $ifNull: ['$revenue_data.ivt_correction', null] }, // Ads.com
        finalized: { $ifNull: ['$revenue_data.finalized', null] }, // Ads.com
        page_views: { $ifNull: ['$revenue_data.page_views', null] }, // Inuvo
        ad_requests: { $ifNull: ['$revenue_data.ad_requests', null] }, // Inuvo

        // Metadata
        feed_type: { $literal: feedType },
        created_at: { $literal: new Date() },
        updated_at: { $literal: new Date() }
      }
    }
  ];

  const mappings = await clicksCollection.aggregate(pipeline).toArray();

  if (mappings.length > 0) {
    const operations = mappings.map((mapping: any) => {
      // Create unique filter based on feed type
      let filter: any;

      switch (feedType) {
        case 'afs':
          // Match on style_id + date
          filter = { style_id: mapping.style_id, date: mapping.date, feed_type: feedType };
          break;
        case 'compado':
          // Match on gclid + date
          filter = { gclid: mapping.gclid, date: mapping.date, feed_type: feedType };
          break;
        case 'adscom':
          // Match on article + date
          filter = { article: mapping.article, date: mapping.date, feed_type: feedType };
          break;
        case 'inuvo':
          // Match on tkid + date
          filter = { tkid: mapping.tkid, date: mapping.date, feed_type: feedType };
          break;
        default:
          // Fallback to campaign_id + date
          filter = { campaign_id: mapping.campaign_id, date: mapping.date, feed_type: feedType };
      }

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
