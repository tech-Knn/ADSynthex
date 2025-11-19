// Emergency cache clearing endpoint
import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

export async function POST(request: NextRequest) {
  try {
    const { secret } = await request.json();

    // Security check
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CLEAR_CACHE] Starting cache clear...');

    // Clear all Google Ads cache keys
    const client = redisClient.getClient();
    if (!client) {
      throw new Error('Redis client not available');
    }

    // Get all keys matching google-ads pattern
    const keys = await client.keys('google-ads:*');
    console.log(`[CLEAR_CACHE] Found ${keys.length} cache keys`);

    if (keys.length > 0) {
      const deleted = await client.del(...keys);
      console.log(`[CLEAR_CACHE] Deleted ${deleted} cache entries`);

      return NextResponse.json({
        success: true,
        message: `Cleared ${deleted} cache entries`,
        keysCleared: keys.length,
        timestamp: new Date().toISOString()
      });
    } else {
      return NextResponse.json({
        success: true,
        message: 'No cache entries found to clear',
        keysCleared: 0,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error: any) {
    console.error('[CLEAR_CACHE] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Cache Clear Endpoint',
    usage: 'POST with { secret } to clear all Google Ads cache',
    security: 'Requires CRON_SECRET'
  });
}
