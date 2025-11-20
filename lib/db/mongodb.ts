/**
 * MongoDB Connection Manager with Connection Pooling
 * Fixes previous issues:
 * - ✅ Persistent connection pool (no new connection per request)
 * - ✅ Automatic reconnection
 * - ✅ Production-ready error handling
 * - ✅ Connection monitoring
 */

import { MongoClient, Db, Collection } from 'mongodb';

if (!process.env.MONGODB_URI) {
  console.warn('[MongoDB] MONGODB_URI not set - MongoDB features disabled');
}

const uri = process.env.MONGODB_URI || '';
const DB_NAME = 'adsynthex';

// Connection pool configuration
const options = {
  maxPoolSize: 10,        // Max 10 connections (Free tier limit)
  minPoolSize: 2,         // Keep 2 connections always ready
  maxIdleTimeMS: 60000,   // Close idle connections after 1 minute
  connectTimeoutMS: 10000, // Connection timeout: 10 seconds
  socketTimeoutMS: 45000,  // Socket timeout: 45 seconds
  retryWrites: true,
  retryReads: true,
};

// Global connection promise (singleton pattern)
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

/**
 * Get or create MongoDB client with connection pooling
 */
async function getClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error('MONGODB_URI is not configured');
  }

  // Return existing client if connected
  if (client && client.topology && client.topology.isConnected()) {
    return client;
  }

  // Create new connection if needed
  if (!clientPromise) {
    console.log('[MongoDB] Creating new connection pool...');
    client = new MongoClient(uri, options);
    clientPromise = client.connect();

    // Connection event listeners
    client.on('connectionPoolCreated', () => {
      console.log('[MongoDB] ✓ Connection pool created');
    });

    client.on('connectionPoolClosed', () => {
      console.log('[MongoDB] Connection pool closed');
    });

    client.on('connectionPoolReady', () => {
      console.log('[MongoDB] ✓ Connection pool ready');
    });

    client.on('error', (error) => {
      console.error('[MongoDB] ✗ Client error:', error);
      // Reset connection on error
      clientPromise = null;
    });
  }

  return clientPromise;
}

/**
 * Get the MongoDB database instance
 */
export async function getDatabase(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}

/**
 * Get a specific collection with type safety
 */
export async function getCollection<T = any>(
  collectionName: string
): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(collectionName);
}

/**
 * Test database connection and return status
 */
export async function testConnection(): Promise<{
  connected: boolean;
  message: string;
  details?: any;
}> {
  try {
    if (!uri) {
      return {
        connected: false,
        message: 'MONGODB_URI not configured',
      };
    }

    const db = await getDatabase();
    const result = await db.command({ ping: 1 });

    if (result.ok === 1) {
      // Get connection stats
      const stats = await db.stats();

      console.log('[MongoDB] ✓ Connection test successful');
      console.log(`[MongoDB] Database: ${DB_NAME}`);
      console.log(`[MongoDB] Collections: ${stats.collections}`);
      console.log(`[MongoDB] Data size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);

      return {
        connected: true,
        message: 'Connected successfully',
        details: {
          database: DB_NAME,
          collections: stats.collections,
          dataSize: `${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`,
          indexSize: `${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`,
        },
      };
    }

    return {
      connected: false,
      message: 'Ping failed',
    };
  } catch (error: any) {
    console.error('[MongoDB] ✗ Connection test failed:', error.message);
    return {
      connected: false,
      message: error.message,
    };
  }
}

/**
 * Close all MongoDB connections (for graceful shutdown)
 */
export async function closeConnection(): Promise<void> {
  try {
    if (client) {
      await client.close();
      console.log('[MongoDB] ✓ Connection closed gracefully');
      client = null;
      clientPromise = null;
    }
  } catch (error) {
    console.error('[MongoDB] Error closing connection:', error);
  }
}

/**
 * Get MongoDB health status
 */
export async function getHealthStatus(): Promise<{
  status: 'healthy' | 'unhealthy' | 'disabled';
  connected: boolean;
  poolSize?: number;
  message?: string;
}> {
  if (!uri) {
    return {
      status: 'disabled',
      connected: false,
      message: 'MONGODB_URI not configured',
    };
  }

  try {
    if (!client || !client.topology || !client.topology.isConnected()) {
      return {
        status: 'unhealthy',
        connected: false,
        message: 'Client not connected',
      };
    }

    const db = await getDatabase();
    await db.command({ ping: 1 });

    // Get connection pool stats
    const poolSize = client.topology?.s?.sessionPool?.sessions?.length || 0;

    return {
      status: 'healthy',
      connected: true,
      poolSize,
      message: 'Connected and responsive',
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      connected: false,
      message: error.message,
    };
  }
}

/**
 * Create indexes for a collection (idempotent)
 */
export async function createIndexes(
  collectionName: string,
  indexes: Array<{
    keys: any;
    options?: any;
  }>
): Promise<string[]> {
  try {
    const collection = await getCollection(collectionName);
    const indexNames: string[] = [];

    for (const index of indexes) {
      const name = await collection.createIndex(index.keys, index.options || {});
      indexNames.push(name);
      console.log(`[MongoDB] ✓ Created index "${name}" on ${collectionName}`);
    }

    return indexNames;
  } catch (error: any) {
    console.error(`[MongoDB] ✗ Error creating indexes on ${collectionName}:`, error.message);
    throw error;
  }
}

/**
 * Setup all database indexes (run once during deployment)
 */
export async function setupAllIndexes(): Promise<void> {
  console.log('[MongoDB] Setting up database indexes...');

  try {
    // AFS Cost indexes
    await createIndexes('afs_cost', [
      {
        keys: { account_id: 1, date: 1, style_id: 1, campaign_id: 1 },
        options: { unique: true, name: 'unique_afs_cost_entry' },
      },
      {
        keys: { date: 1, feed_type: 1 },
        options: { name: 'afs_cost_date_feed' },
      },
      {
        keys: { style_id: 1, date: 1 },
        options: { name: 'afs_cost_style_date', sparse: true },
      },
    ]);

    // AFS Revenue indexes
    await createIndexes('afs_revenue', [
      {
        keys: { style_id: 1, date: 1, country_name: 1 },
        options: { unique: true, name: 'unique_afs_revenue_entry', sparse: true },
      },
      {
        keys: { date: 1, feed_type: 1 },
        options: { name: 'afs_revenue_date_feed' },
      },
    ]);

    // Compado Cost indexes
    await createIndexes('compado_cost', [
      {
        keys: { account_id: 1, date: 1, gclid: 1, campaign_id: 1 },
        options: { unique: true, name: 'unique_compado_cost_entry', sparse: true },
      },
      {
        keys: { date: 1, feed_type: 1 },
        options: { name: 'compado_cost_date_feed' },
      },
      {
        keys: { gclid: 1, date: 1 },
        options: { name: 'compado_cost_gclid_date', sparse: true },
      },
    ]);

    // Compado Revenue indexes
    await createIndexes('compado_revenue', [
      {
        keys: { gclid: 1, date: 1 },
        options: { unique: true, name: 'unique_compado_revenue_entry', sparse: true },
      },
      {
        keys: { date: 1, feed_type: 1 },
        options: { name: 'compado_revenue_date_feed' },
      },
    ]);

    // Ads.com Cost indexes
    await createIndexes('adscom_cost', [
      {
        keys: { account_id: 1, date: 1, article: 1, campaign_id: 1 },
        options: { unique: true, name: 'unique_adscom_cost_entry', sparse: true },
      },
      {
        keys: { date: 1, feed_type: 1 },
        options: { name: 'adscom_cost_date_feed' },
      },
      {
        keys: { article: 1, date: 1 },
        options: { name: 'adscom_cost_article_date', sparse: true },
      },
    ]);

    // Ads.com Revenue indexes
    await createIndexes('adscom_revenue', [
      {
        keys: { article: 1, date: 1 },
        options: { unique: true, name: 'unique_adscom_revenue_entry', sparse: true },
      },
      {
        keys: { date: 1, feed_type: 1 },
        options: { name: 'adscom_revenue_date_feed' },
      },
    ]);

    // Sync Status indexes
    await createIndexes('sync_status', [
      {
        keys: { feed_type: 1, account_id: 1 },
        options: { unique: true, name: 'unique_sync_status' },
      },
      {
        keys: { last_sync_time: -1 },
        options: { name: 'sync_status_recent' },
      },
    ]);

    console.log('[MongoDB] ✓ All indexes created successfully');
  } catch (error) {
    console.error('[MongoDB] ✗ Error setting up indexes:', error);
    throw error;
  }
}

// Graceful shutdown handler
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('[MongoDB] SIGTERM received, closing connections...');
    await closeConnection();
  });

  process.on('SIGINT', async () => {
    console.log('[MongoDB] SIGINT received, closing connections...');
    await closeConnection();
  });
}

export default getClient;
