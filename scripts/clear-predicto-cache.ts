/**
 * Clear Predicto Cache
 * Run this script to clear all Predicto-related cache in Redis
 */

import { redisClient } from '../lib/redis-client';

async function clearPredictoCache() {
  try {
    console.log('🧹 Clearing Predicto cache from Redis...\n');

    // Connect to Redis
    await redisClient.ping();
    console.log('✓ Connected to Redis\n');

    // Get all Predicto cache keys
    const keys = await redisClient.keys('*predicto*');
    console.log(`Found ${keys.length} Predicto cache keys:\n`);

    if (keys.length === 0) {
      console.log('No cache keys to clear.');
      process.exit(0);
    }

    // Show keys
    keys.forEach((key, index) => {
      console.log(`  ${index + 1}. ${key}`);
    });

    console.log('\n🗑️  Deleting cache keys...\n');

    // Delete all keys
    let deleted = 0;
    for (const key of keys) {
      await redisClient.del(key);
      deleted++;
      console.log(`  ✓ Deleted: ${key}`);
    }

    console.log(`\nSuccessfully cleared ${deleted} cache keys!`);
    console.log('\n💡 Now refresh the Predicto page to fetch fresh data.');

    process.exit(0);
  } catch (error: any) {
    console.error('Error clearing cache:', error.message);
    process.exit(1);
  }
}

clearPredictoCache();
