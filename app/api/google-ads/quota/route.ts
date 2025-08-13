import { NextRequest, NextResponse } from 'next/server';
import { getQuotaStatus } from '../../../../lib/google-ads-api';
import { smartRateLimiter } from '../../../../lib/smart-rate-limiter';
import { unifiedCache } from '../../../../lib/unified-cache-manager';

export async function GET(request: NextRequest) {
  try {
    const quotaStatus = getQuotaStatus();
    const rateLimiterStats = smartRateLimiter.getStats();
    const cacheStats = unifiedCache.getStats();
    
    return NextResponse.json({
      quota: quotaStatus,
      rateLimiter: rateLimiterStats,
      cache: cacheStats,
      timestamp: new Date().toISOString(),
      recommendations: getRecommendations(quotaStatus, rateLimiterStats)
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Error fetching quota status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quota status' },
      { status: 500 }
    );
  }
}

function getRecommendations(quotaStatus: any, rateLimiterStats: any) {
  const recommendations = [];
  
  // Rate limiter recommendations
  if (rateLimiterStats.errorRate > 0.1) {
    recommendations.push({
      type: 'warning',
      message: `High error rate detected: ${Math.round(rateLimiterStats.errorRate * 100)}%`,
      action: 'Check API credentials and network connectivity.'
    });
  }
  
  if (rateLimiterStats.queueLength > 5) {
    recommendations.push({
      type: 'info',
      message: `Request queue is building up: ${rateLimiterStats.queueLength} pending requests`,
      action: 'Consider reducing request frequency or implementing better caching.'
    });
  }
  
  if (rateLimiterStats.currentQPS < 2) {
    recommendations.push({
      type: 'info',
      message: `QPS is low (${rateLimiterStats.currentQPS}), indicating possible rate limiting`,
      action: 'Monitor for API errors and consider reducing request frequency.'
    });
  }
  
  // Legacy quota recommendations
  if (quotaStatus.usagePercentage >= 90) {
    recommendations.push({
      type: 'warning',
      message: 'API quota usage is high. The new optimization system should help reduce usage.',
      action: 'Monitor the optimized endpoints for better quota efficiency.'
    });
  }
  
  // Optimization recommendations
  recommendations.push({
    type: 'success',
    message: 'AdSyntheX Optimization Suite is active!',
    action: `Smart Rate Limiter running at ${rateLimiterStats.currentQPS} QPS with ${rateLimiterStats.queueLength} queued requests.`
  });
  
  return recommendations;
} 