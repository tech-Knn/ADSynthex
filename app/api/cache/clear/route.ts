/**
 * Cache Management API
 * Endpoint to clear Redis cache for specific accounts
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, dateRanges } = body;

    console.log('[CACHE_CLEAR] Cache clear request:', { accountId });

    let clearedCount = 0;

    if (accountId) {
      // Clear cache for specific account by deleting known cache key patterns
      console.log(`[CACHE_CLEAR] Clearing cache for account: ${accountId}`);

      // Generate common cache key patterns for the account
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7*86400000).toISOString().split('T')[0];

      const keysToDelete = [
        `cache:google-ads:${accountId}:${today}:${today}`,
        `cache:google-ads:${accountId}:${yesterday}:${today}`,
        `cache:google-ads:${accountId}:${sevenDaysAgo}:${today}`,
        // Add more common patterns as needed
      ];

      // If specific date ranges provided, add those too
      if (dateRanges && Array.isArray(dateRanges)) {
        dateRanges.forEach(({ startDate, endDate }: any) => {
          keysToDelete.push(`cache:google-ads:${accountId}:${startDate}:${endDate}`);
        });
      }

      for (const key of keysToDelete) {
        try {
          await redisClient.del(key);
          clearedCount++;
        } catch (err) {
          console.warn(`[CACHE_CLEAR] Failed to delete key ${key}:`, err);
        }
      }

      console.log(`[CACHE_CLEAR] ✓ Cleared ${clearedCount} cache entries for account ${accountId}`);

      return NextResponse.json({
        success: true,
        message: `Cleared cache for account ${accountId}`,
        clearedCount,
        accountId,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      error: 'Missing parameters',
      message: 'Provide accountId to clear cache'
    }, { status: 400 });

  } catch (error) {
    console.error('[CACHE_CLEAR] Error:', error);
    return NextResponse.json({
      error: 'Failed to clear cache',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET endpoint to check cache health
 */
export async function GET() {
  try {
    const healthStatus = redisClient.getHealthStatus();

    return NextResponse.json({
      ...healthStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CACHE_STATUS] Error:', error);
    return NextResponse.json({
      error: 'Failed to get cache status',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
