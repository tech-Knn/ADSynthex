// lib/db/setup-indexes.ts
// Database Indexes Setup - Run Once After MongoDB Connection

import { getCollection } from './mongodb';
import { FeedType, getCollectionNames, SHARED_COLLECTIONS } from './types';

const FEED_TYPES: FeedType[] = ['adscom', 'afs', 'compado', 'inuvo'];

/**
 * Create indexes for all collections
 * Run this once after MongoDB setup
 */
export async function setupAllIndexes(): Promise<void> {
  console.log('[DB_SETUP] Starting index creation for all collections...');

  try {
    // Setup indexes for each feed type
    for (const feedType of FEED_TYPES) {
      await setupFeedIndexes(feedType);
    }

    // Setup shared collection indexes
    await setupSyncStatusIndexes();

    console.log('[DB_SETUP] ✓ All indexes created successfully!');
  } catch (error) {
    console.error('[DB_SETUP] Error creating indexes:', error);
    throw error;
  }
}

/**
 * Setup indexes for a specific feed type
 */
async function setupFeedIndexes(feedType: FeedType): Promise<void> {
  console.log(`[DB_SETUP] Creating indexes for ${feedType}...`);

  const collections = getCollectionNames(feedType);

  // ==================== CLICKS COLLECTION ====================
  const clicksCollection = await getCollection(collections.clicks);

  // Unique index - different matching keys per feed type
  if (feedType === 'afs') {
    // AFS: Unique on style_id + domain + date
    await clicksCollection.createIndex(
      { style_id: 1, domain: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_afs_style_domain_per_day', sparse: true }
    );
  } else if (feedType === 'adscom') {
    // Ads.com: Unique on article + date
    await clicksCollection.createIndex(
      { article: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_article_per_day', sparse: true }
    );
  } else if (feedType === 'inuvo') {
    // Inuvo: Unique on tkid + date
    await clicksCollection.createIndex(
      { tkid: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_tkid_per_day', sparse: true }
    );
  } else {
    // Compado: Unique on GCLID + date
    await clicksCollection.createIndex(
      { gclid: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_click_per_day', sparse: true }
    );
  }

  // Index for date range queries
  await clicksCollection.createIndex(
    { date: 1, feed_type: 1 },
    { name: 'date_feed_lookup' }
  );

  // Index for account lookups
  await clicksCollection.createIndex(
    { account_id: 1, date: 1 },
    { name: 'account_date_lookup' }
  );

  // TTL index - auto-delete clicks older than 90 days
  await clicksCollection.createIndex(
    { created_at: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_clicks_90days' }
  );

  console.log(`[DB_SETUP]   ✓ ${collections.clicks} indexes created`);

  // ==================== REVENUE COLLECTION ====================
  const revenueCollection = await getCollection(collections.revenue);

  // Unique index - different matching keys per feed type
  if (feedType === 'afs') {
    // AFS: Unique on style_id + domain + date
    await revenueCollection.createIndex(
      { style_id: 1, domain: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_afs_revenue_per_day', sparse: true }
    );
  } else if (feedType === 'adscom') {
    // Ads.com: Unique on article + date
    await revenueCollection.createIndex(
      { article: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_article_revenue_per_day', sparse: true }
    );
  } else if (feedType === 'inuvo') {
    // Inuvo: Unique on tkid + date
    await revenueCollection.createIndex(
      { tkid: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_tkid_revenue_per_day', sparse: true }
    );
  } else {
    // Compado: Unique on GCLID + date
    await revenueCollection.createIndex(
      { gclid: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_revenue_per_day', sparse: true }
    );
  }

  // Index for date range queries
  await revenueCollection.createIndex(
    { date: 1, feed_type: 1 },
    { name: 'date_feed_lookup' }
  );

  // Index for AFS style_id lookups
  if (feedType === 'afs') {
    await revenueCollection.createIndex(
      { style_id: 1, date: 1 },
      { name: 'style_date_lookup', sparse: true }
    );
  }

  // TTL index - auto-delete revenue older than 90 days
  await revenueCollection.createIndex(
    { created_at: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_revenue_90days' }
  );

  console.log(`[DB_SETUP]   ✓ ${collections.revenue} indexes created`);

  // ==================== COST-REVENUE MAPPING COLLECTION ====================
  const mappingCollection = await getCollection(collections.costRevenueMapping);

  // Unique index - different matching keys per feed type
  if (feedType === 'afs') {
    // AFS: Unique on style_id + domain + date
    await mappingCollection.createIndex(
      { style_id: 1, domain: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_afs_mapping_per_day', sparse: true }
    );
  } else if (feedType === 'adscom') {
    // Ads.com: Unique on article + date
    await mappingCollection.createIndex(
      { article: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_article_mapping_per_day', sparse: true }
    );
  } else if (feedType === 'inuvo') {
    // Inuvo: Unique on tkid + date
    await mappingCollection.createIndex(
      { tkid: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_tkid_mapping_per_day', sparse: true }
    );
  } else {
    // Compado: Unique on GCLID + date
    await mappingCollection.createIndex(
      { gclid: 1, date: 1, feed_type: 1 },
      { unique: true, name: 'unique_mapping_per_day', sparse: true }
    );
  }

  // Compound index for efficient queries
  await mappingCollection.createIndex(
    { account_id: 1, campaign_id: 1, date: 1 },
    { name: 'account_campaign_date_lookup' }
  );

  // Index for date range queries
  await mappingCollection.createIndex(
    { date: 1, feed_type: 1 },
    { name: 'date_feed_lookup' }
  );

  // Index for ROI filtering
  await mappingCollection.createIndex(
    { roi: 1, date: 1 },
    { name: 'roi_date_lookup' }
  );

  // TTL index - auto-delete mappings older than 90 days
  await mappingCollection.createIndex(
    { created_at: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_mapping_90days' }
  );

  console.log(`[DB_SETUP]   ✓ ${collections.costRevenueMapping} indexes created`);

  // ==================== CAMPAIGNS COLLECTION ====================
  const campaignsCollection = await getCollection(collections.campaigns);

  // Unique index on account + campaign + date + feed_type
  await campaignsCollection.createIndex(
    { account_id: 1, campaign_id: 1, date: 1, feed_type: 1 },
    { unique: true, name: 'unique_campaign_per_day' }
  );

  // Index for dashboard queries
  await campaignsCollection.createIndex(
    { account_id: 1, date: 1 },
    { name: 'account_date_lookup' }
  );

  // Index for sorting by metrics
  await campaignsCollection.createIndex(
    { cost_usd: -1, date: 1 },
    { name: 'cost_desc_lookup' }
  );

  await campaignsCollection.createIndex(
    { roi: -1, date: 1 },
    { name: 'roi_desc_lookup' }
  );

  // TTL index - auto-delete campaigns older than 90 days
  await campaignsCollection.createIndex(
    { created_at: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_campaigns_90days' }
  );

  console.log(`[DB_SETUP]   ✓ ${collections.campaigns} indexes created`);

  // ==================== DAILY METRICS COLLECTION ====================
  const dailyMetricsCollection = await getCollection(collections.dailyMetrics);

  // Unique index on account + date + feed_type
  await dailyMetricsCollection.createIndex(
    { account_id: 1, date: 1, feed_type: 1 },
    { unique: true, name: 'unique_daily_metrics' }
  );

  // Index for date range queries
  await dailyMetricsCollection.createIndex(
    { date: 1, feed_type: 1 },
    { name: 'date_feed_lookup' }
  );

  // TTL index - auto-delete metrics older than 90 days
  await dailyMetricsCollection.createIndex(
    { created_at: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_daily_metrics_90days' }
  );

  console.log(`[DB_SETUP]   ✓ ${collections.dailyMetrics} indexes created`);
}

/**
 * Setup indexes for sync_status collection
 */
async function setupSyncStatusIndexes(): Promise<void> {
  console.log('[DB_SETUP] Creating indexes for sync_status...');

  const collection = await getCollection(SHARED_COLLECTIONS.syncStatus);

  // Unique index on feed_type + account_id
  await collection.createIndex(
    { feed_type: 1, account_id: 1 },
    { unique: true, name: 'unique_sync_status' }
  );

  // Index for recent sync lookups
  await collection.createIndex(
    { last_sync_time: -1 },
    { name: 'recent_syncs' }
  );

  // Index for status filtering
  await collection.createIndex(
    { status: 1, feed_type: 1 },
    { name: 'status_feed_lookup' }
  );

  console.log('[DB_SETUP]   ✓ sync_status indexes created');
}

/**
 * Drop all indexes (useful for re-setup)
 */
export async function dropAllIndexes(): Promise<void> {
  console.log('[DB_SETUP] Dropping all indexes...');

  try {
    for (const feedType of FEED_TYPES) {
      const collections = getCollectionNames(feedType);

      for (const collectionName of Object.values(collections)) {
        const collection = await getCollection(collectionName);
        await collection.dropIndexes();
        console.log(`[DB_SETUP]   Dropped indexes for ${collectionName}`);
      }
    }

    // Drop sync_status indexes
    const syncCollection = await getCollection(SHARED_COLLECTIONS.syncStatus);
    await syncCollection.dropIndexes();
    console.log('[DB_SETUP]   Dropped indexes for sync_status');

    console.log('[DB_SETUP] ✓ All indexes dropped');
  } catch (error) {
    console.error('[DB_SETUP] Error dropping indexes:', error);
    throw error;
  }
}

/**
 * List all indexes for verification
 */
export async function listAllIndexes(): Promise<any> {
  const indexesByCollection: any = {};

  for (const feedType of FEED_TYPES) {
    const collections = getCollectionNames(feedType);

    for (const [key, collectionName] of Object.entries(collections)) {
      const collection = await getCollection(collectionName);
      const indexes = await collection.indexes();
      indexesByCollection[collectionName] = indexes;
    }
  }

  // Sync status indexes
  const syncCollection = await getCollection(SHARED_COLLECTIONS.syncStatus);
  indexesByCollection[SHARED_COLLECTIONS.syncStatus] = await syncCollection.indexes();

  return indexesByCollection;
}
