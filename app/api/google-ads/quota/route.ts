import { NextRequest, NextResponse } from 'next/server';
import { getQuotaStatus, getRateLimitConfig } from '../../../../lib/google-ads-api';

export async function GET(request: NextRequest) {
  try {
    const quotaStatus = getQuotaStatus();
    const rateLimitConfig = getRateLimitConfig();
    
    return NextResponse.json({
      quota: quotaStatus,
      config: rateLimitConfig,
      timestamp: new Date().toISOString(),
      recommendations: getRecommendations(quotaStatus, rateLimitConfig)
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

function getRecommendations(quotaStatus: any, rateLimitConfig: any) {
  const recommendations = [];
  
  if (quotaStatus.usagePercentage >= 90) {
    recommendations.push({
      type: 'warning',
      message: 'API quota usage is high. Consider reducing request frequency or upgrading your quota.',
      action: 'Monitor usage closely and implement caching strategies.'
    });
  }
  
  if (quotaStatus.usagePercentage >= 95) {
    recommendations.push({
      type: 'critical',
      message: 'API quota usage is critical. Requests may be throttled soon.',
      action: 'Implement aggressive caching and reduce API calls immediately.'
    });
  }
  
  if (quotaStatus.remainingRequests <= 100) {
    recommendations.push({
      type: 'info',
      message: 'Low remaining requests for today.',
      action: 'Consider implementing request batching and optimizing queries.'
    });
  }
  
  // Calculate estimated requests per dashboard load
  const accountsCount = 9; // Your 9 accounts
  const requestsPerAccount = 5; // 5 API calls per account
  const estimatedRequestsPerLoad = accountsCount * requestsPerAccount;
  
  if (quotaStatus.remainingRequests < estimatedRequestsPerLoad) {
    recommendations.push({
      type: 'warning',
      message: `Insufficient quota for full dashboard load (needs ~${estimatedRequestsPerLoad} requests).`,
      action: 'Consider implementing partial data loading or using cached data.'
    });
  }
  
  return recommendations;
} 