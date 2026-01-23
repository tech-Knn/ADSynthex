/**
 * Health Check and Monitoring API
 * Provides real-time status of all systems
 */

import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis-client';
import { googleAdsRateLimiter } from '@/lib/redis-rate-limiter';
import { redisCacheManager } from '@/lib/redis-cache-manager';
import { getProductionCacheStatus } from '@/lib/production-api-wrapper';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get all system health information in parallel
    const [
      redisHealth,
      quotaStatus,
      cacheStats,
      queueStatus
    ] = await Promise.all([
      Promise.resolve(redisClient.getHealthStatus()),
      googleAdsRateLimiter.getQuotaStatus(),
      Promise.resolve(redisCacheManager.getStats()),
      Promise.resolve(getProductionCacheStatus())
    ]);

    // Determine overall system health
    const systemHealth = {
      status: 'healthy' as 'healthy' | 'degraded' | 'down',
      checks: {
        redis: redisHealth.connected,
        quota: quotaStatus.safeToOperate,
        cache: cacheStats.hitRate > 0.5,
        queue: queueStatus.queueSize < 10
      }
    };

    // Calculate overall status
    if (!systemHealth.checks.redis || !systemHealth.checks.quota) {
      systemHealth.status = 'degraded';
    }
    if (!systemHealth.checks.redis && !systemHealth.checks.quota) {
      systemHealth.status = 'down';
    }

    // Calculate quota usage percentage
    const quotaUsagePercent = quotaStatus.dailyLimit > 0
      ? Math.round((quotaStatus.dailyUsed / quotaStatus.dailyLimit) * 100)
      : 0;

    const response = {
      status: systemHealth.status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: Date.now() - startTime,

      // Redis Status
      redis: {
        connected: redisHealth.connected,
        mode: redisHealth.mode,
        fallbackCacheSize: redisHealth.fallbackCacheSize,
        hasCredentials: redisHealth.config.hasCredentials
      },

      // Google Ads API Quota
      quota: {
        daily: {
          used: quotaStatus.dailyUsed,
          limit: quotaStatus.dailyLimit,
          remaining: quotaStatus.quotaRemaining,
          percentage: quotaUsagePercent
        },
        hourly: {
          used: quotaStatus.hourlyUsed,
          limit: quotaStatus.hourlyLimit,
          remaining: quotaStatus.hourlyLimit - quotaStatus.hourlyUsed
        },
        safeToOperate: quotaStatus.safeToOperate,
        isInCooldown: quotaStatus.isInCooldown,
        cooldownEnds: quotaStatus.cooldownEnds,
        retryAfterSeconds: quotaStatus.retryAfterSeconds,
        circuitState: quotaStatus.circuitState
      },

      // Cache Performance
      cache: {
        hitRate: Math.round(cacheStats.hitRate * 100),
        memoryHits: cacheStats.memoryHits,
        redisHits: cacheStats.redisHits,
        apiCalls: cacheStats.apiCalls,
        totalRequests: cacheStats.totalRequests,
        memoryCacheSize: cacheStats.memoryCacheSize
      },

      // Background Refresh Queue
      queue: {
        size: queueStatus.queueSize,
        isRefreshing: queueStatus.isRefreshing,
        jobs: queueStatus.jobs
      },

      // System Recommendations
      recommendations: generateRecommendations({
        quotaUsagePercent,
        quotaStatus,
        cacheStats,
        queueStatus,
        redisHealth
      }),

      // Health Checks
      checks: systemHealth.checks
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('[HEALTH] Error generating health report:', error);

    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime
    }, {
      status: 500
    });
  }
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(data: {
  quotaUsagePercent: number;
  quotaStatus: any;
  cacheStats: any;
  queueStatus: any;
  redisHealth: any;
}): string[] {
  const recommendations: string[] = [];

  // Quota warnings
  if (data.quotaUsagePercent > 90) {
    recommendations.push('CRITICAL: Daily quota usage above 90% - Consider reducing API calls');
  } else if (data.quotaUsagePercent > 70) {
    recommendations.push('WARNING: Daily quota usage above 70% - Monitor closely');
  }

  if (data.quotaStatus.isInCooldown) {
    recommendations.push(`🔴 API in cooldown until ${data.quotaStatus.cooldownEnds} - Serving cached data only`);
  }

  // Cache performance
  if (data.cacheStats.hitRate < 0.5) {
    recommendations.push('📊 Cache hit rate below 50% - Consider increasing cache TTL');
  } else if (data.cacheStats.hitRate > 0.9) {
    recommendations.push('Excellent cache performance (>90% hit rate)');
  }

  // Queue warnings
  if (data.queueStatus.queueSize > 10) {
    recommendations.push(`⏳ Background refresh queue is large (${data.queueStatus.queueSize} jobs) - May indicate rate limiting`);
  }

  // Redis status
  if (!data.redisHealth.connected) {
    recommendations.push('🔴 Redis disconnected - Using in-memory fallback (may lose rate limit protection)');
  }

  // Circuit breaker
  if (data.quotaStatus.circuitState === 'OPEN') {
    recommendations.push('🔴 Circuit breaker OPEN - API requests blocked due to high error rate');
  } else if (data.quotaStatus.circuitState === 'HALF_OPEN') {
    recommendations.push('Circuit breaker HALF_OPEN - Testing API recovery');
  }

  // All good
  if (recommendations.length === 0) {
    recommendations.push('All systems operating normally');
  }

  return recommendations;
}
