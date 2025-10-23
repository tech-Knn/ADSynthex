/**
 * Cache Warmup API
 * Prefetches common queries to ensure fast user experience
 *
 * Call this endpoint:
 * - Every 10 minutes via cron job
 * - During off-peak hours (e.g., 2-4 AM)
 * - After clearing cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { warmupCache } from '@/lib/production-api-wrapper';
import { googleAdsRateLimiter } from '@/lib/redis-rate-limiter';

// Target accounts to warm up
const WARMUP_ACCOUNTS = [
  '5416418019', // Compado - UTC - 01
  '5108802445', // Compado - UTC - 02
  '1671699399', // Compado - UTC - 03
];

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Security: Verify authorization (optional - you can add auth header check)
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CRON_SECRET || 'your-secret-key';

    if (authHeader !== `Bearer ${expectedSecret}`) {
      console.warn('[WARMUP] Unauthorized warmup attempt');
      return NextResponse.json({
        error: 'Unauthorized',
        message: 'Invalid or missing authorization header'
      }, { status: 401 });
    }

    // Check if we're in cooldown
    const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

    if (quotaStatus.isInCooldown) {
      console.log('[WARMUP] Skipping warmup - API in cooldown');
      return NextResponse.json({
        status: 'skipped',
        reason: 'API in cooldown',
        cooldownEnds: quotaStatus.cooldownEnds,
        message: 'Warmup skipped to preserve quota during cooldown period'
      });
    }

    // Check quota usage
    if (quotaStatus.usagePercentage > 80) {
      console.log('[WARMUP] Skipping warmup - quota usage high');
      return NextResponse.json({
        status: 'skipped',
        reason: 'Quota usage above 80%',
        currentUsage: quotaStatus.usagePercentage,
        message: 'Warmup skipped to preserve remaining quota'
      });
    }

    // Parse request body for custom accounts (optional)
    let accountsToWarmup = WARMUP_ACCOUNTS;
    try {
      const body = await request.json();
      if (body.accountIds && Array.isArray(body.accountIds)) {
        accountsToWarmup = body.accountIds;
      }
    } catch {
      // No body or invalid JSON - use default accounts
    }

    console.log(`[WARMUP] Starting cache warmup for ${accountsToWarmup.length} accounts...`);

    // Run warmup
    await warmupCache(accountsToWarmup);

    const duration = Date.now() - startTime;

    // Get updated quota status
    const updatedQuota = await googleAdsRateLimiter.getQuotaStatus();

    return NextResponse.json({
      status: 'completed',
      timestamp: new Date().toISOString(),
      duration,
      accountsWarmedUp: accountsToWarmup.length,
      quotaUsed: {
        before: quotaStatus.dailyUsed,
        after: updatedQuota.dailyUsed,
        difference: updatedQuota.dailyUsed - quotaStatus.dailyUsed
      },
      quotaRemaining: updatedQuota.quotaRemaining,
      message: `Successfully warmed up cache for ${accountsToWarmup.length} accounts in ${Math.round(duration / 1000)}s`
    });

  } catch (error) {
    console.error('[WARMUP] Cache warmup failed:', error);

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * GET endpoint for status/info
 */
export async function GET(request: NextRequest) {
  const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

  return NextResponse.json({
    info: 'Cache Warmup API',
    usage: 'POST to this endpoint with Authorization: Bearer <CRON_SECRET>',
    defaultAccounts: WARMUP_ACCOUNTS,
    currentQuota: {
      dailyUsed: quotaStatus.dailyUsed,
      dailyLimit: quotaStatus.dailyLimit,
      percentage: quotaStatus.usagePercentage,
      safeToWarmup: quotaStatus.usagePercentage < 80 && !quotaStatus.isInCooldown
    },
    recommendations: {
      frequency: 'Every 10-15 minutes',
      bestTime: 'During off-peak hours (2-4 AM)',
      skipConditions: [
        'Quota usage > 80%',
        'API in cooldown',
        'Circuit breaker open'
      ]
    }
  });
}
