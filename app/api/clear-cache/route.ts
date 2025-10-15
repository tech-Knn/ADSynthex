import { NextRequest, NextResponse } from 'next/server';
import { redisCacheManager } from '@/lib/redis-cache-manager';

/**
 * Clear Cache API
 * Clears Redis/memory cache to force fresh API calls
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[CLEAR_CACHE] Clearing all caches...');

    // Clear Redis cache (will also clear memory cache)
    await redisCacheManager.clearAll();

    console.log('[CLEAR_CACHE] ✓ Cache cleared successfully');

    return NextResponse.json({
      success: true,
      message: 'Cache cleared successfully. Next API call will fetch fresh data.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CLEAR_CACHE] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST to clear cache',
    endpoint: '/api/clear-cache',
    method: 'POST'
  });
}
