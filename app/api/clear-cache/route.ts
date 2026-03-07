// Cache clearing endpoint with feed-specific isolation
import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Support both JSON body (old method) and query params (new method)
    let secret: string | null = null;
    let pattern: string | null = null;
    let feed: string | null = null;
    let account: string | null = null;

    const { searchParams } = new URL(request.url);

    // Try to get from query params first (easier to use)
    secret = searchParams.get('secret');
    feed = searchParams.get('feed');
    account = searchParams.get('account');

    // Fallback to JSON body for backward compatibility
    if (!secret) {
      try {
        const body = await request.json();
        secret = body.secret;
        pattern = body.pattern;
      } catch {
        // No JSON body, continue with query params only
      }
    }

    // Security check
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized - Invalid secret' }, { status: 401 });
    }

    console.log(`[CLEAR_CACHE] Request - Feed: ${feed || 'all'}, Account: ${account || 'all'}, Pattern: ${pattern || 'auto'}`);

    const patterns: string[] = [];

    // If explicit pattern provided (old method), use it
    if (pattern) {
      patterns.push(pattern);
    } else {
      // New method: Feed-specific cache clearing
      const targetFeed = feed || 'all';

      if (targetFeed === 'all' || targetFeed === 'afs') {
        patterns.push('afs_aggregated:*', 'afs_cost_revenue:*');
        // Also clear old format cache keys (before feed isolation fix)
        patterns.push('adsense_cost_revenue:*');
      }

      if (targetFeed === 'all' || targetFeed === 'carhp') {
        patterns.push('carhp_aggregated:*', 'carhp_cost_revenue:*');
      }

      if (targetFeed === 'all' || targetFeed === 'predicto') {
        patterns.push('predicto-agg:*', 'predicto:*');
      }

      if (targetFeed === 'all' || targetFeed === 'compado') {
        patterns.push('compado-agg:*', 'compado:*');
      }

      // Always clear bulletproof Google Ads cache (shared across feeds)
      if (account) {
        patterns.push(`bulletproof_google_ads:*:${account}:*`);
      } else {
        patterns.push('bulletproof_google_ads:*');
      }
    }

    if (!redisClient.isRedisConnected()) {
      return NextResponse.json({
        error: 'Redis not connected',
        message: 'Cache clearing requires Redis connection'
      }, { status: 503 });
    }

    let totalKeysDeleted = 0;
    const deletedByPattern: Record<string, number> = {};

    // Use Upstash Redis REST API directly for KEYS command
    const Redis = require('@upstash/redis').Redis;
    const upstashClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    for (const cachePattern of patterns) {
      try {
        console.log(`[CLEAR_CACHE] Searching for pattern: ${cachePattern}`);
        const keys = await upstashClient.keys(cachePattern);

        if (keys && Array.isArray(keys) && keys.length > 0) {
          console.log(`[CLEAR_CACHE] Found ${keys.length} keys for pattern: ${cachePattern}`);

          // Delete in batches to avoid overwhelming Redis
          let deleted = 0;
          const batchSize = 100;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await Promise.all(batch.map(key => redisClient.del(key)));
            deleted += batch.length;
          }

          deletedByPattern[cachePattern] = deleted;
          totalKeysDeleted += deleted;
        } else {
          deletedByPattern[cachePattern] = 0;
        }
      } catch (patternError: any) {
        console.warn(`[CLEAR_CACHE] Error with pattern ${cachePattern}:`, patternError.message);
        deletedByPattern[cachePattern] = -1;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[CLEAR_CACHE] Completed - Deleted ${totalKeysDeleted} keys in ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: `Cache cleared successfully`,
      stats: {
        feed: feed || 'all',
        account: account || 'all',
        totalKeysDeleted,
        deletedByPattern,
        durationMs: duration
      },
      timestamp: new Date().toISOString()
    });

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
    message: 'Cache Clear Endpoint - Feed Isolated',
    usage: {
      method: 'POST',
      queryParams: {
        secret: 'CRON_SECRET (required)',
        feed: 'all | afs | carhp | predicto | compado (optional, default: all)',
        account: 'Specific account ID to clear (optional)'
      },
      examples: [
        'POST /api/clear-cache?secret=XXX&feed=all',
        'POST /api/clear-cache?secret=XXX&feed=afs',
        'POST /api/clear-cache?secret=XXX&feed=carhp',
        'POST /api/clear-cache?secret=XXX&feed=carhp&account=5771818790'
      ],
      legacyMethod: 'POST with JSON body: { secret, pattern }',
    },
    security: 'Requires CRON_SECRET environment variable'
  });
}
