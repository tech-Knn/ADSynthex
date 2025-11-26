/**
 * Memory Diagnostics Endpoint
 * Shows real-time memory usage and system health
 */

import { NextResponse } from 'next/server';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { redisCacheManager } from '@/lib/redis-cache-manager';
import { redisClient } from '@/lib/redis-client';

export async function GET() {
  try {
    // Get memory usage
    const memoryUsage = process.memoryUsage();

    // Convert to MB
    const memoryMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024)
    };

    // Calculate percentage
    const heapPercentage = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

    // Get system health
    const systemHealth = await bulletproofAPI.getHealthStatus();
    const cacheStats = redisCacheManager.getStats();
    const redisHealth = redisClient.getHealthStatus();

    // Check if approaching memory limit (512MB on Render)
    const memoryLimit = 512; // MB
    const usedPercentage = Math.round((memoryMB.heapUsed / memoryLimit) * 100);
    const isMemoryCritical = usedPercentage > 80;
    const isMemoryWarning = usedPercentage > 60;

    const response = {
      timestamp: new Date().toISOString(),
      memory: {
        ...memoryMB,
        heapPercentage,
        limitMB: memoryLimit,
        usedPercentage,
        status: isMemoryCritical ? 'CRITICAL' : isMemoryWarning ? 'WARNING' : 'OK',
        warning: isMemoryCritical
          ? '🔴 CRITICAL: Memory usage above 80%! OOM crash imminent!'
          : isMemoryWarning
          ? '⚠️  WARNING: Memory usage above 60%'
          : '✅ Memory usage normal'
      },
      redis: {
        ...redisHealth,
        status: redisHealth.connected ? '✅ Connected' : '❌ Using fallback'
      },
      cache: {
        ...cacheStats,
        hitRate: `${cacheStats.hitRate}%`,
        status: cacheStats.redisConnected ? '✅ Redis caching active' : '⚠️  In-memory only'
      },
      quota: systemHealth.quota,
      health: systemHealth.systemHealth,
      uptime: process.uptime(),
      recommendations: []
    };

    // Add recommendations
    if (isMemoryCritical) {
      response.recommendations.push('IMMEDIATE: Reduce concurrent requests');
      response.recommendations.push('IMMEDIATE: Clear in-memory caches');
      response.recommendations.push('Consider restarting service');
    } else if (isMemoryWarning) {
      response.recommendations.push('Monitor memory closely');
      response.recommendations.push('Consider reducing cache sizes');
    }

    if (!redisHealth.connected) {
      response.recommendations.push('Redis not connected - check credentials');
    }

    if (cacheStats.hitRate < 50) {
      response.recommendations.push('Low cache hit rate - check TTL settings');
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Diagnostics failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
