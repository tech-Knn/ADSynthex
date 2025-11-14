// app/api/dashboard-v2/route.ts
// MongoDB-backed Dashboard API - Fast queries without Google API rate limits

import { NextRequest, NextResponse } from 'next/server';
import { getDashboardCampaigns } from '@/lib/db/operations';
import { FeedType } from '@/lib/db/types';
import { redisCacheManager } from '@/lib/redis-cache-manager';

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, accountId, feedType } = await request.json();

    console.log(`[DASHBOARD_V2] Query: ${feedType} | ${accountId} | ${startDate} - ${endDate}`);

    // Validate feed type
    const validFeeds: FeedType[] = ['adscom', 'afs', 'compado', 'inuvo'];
    if (!validFeeds.includes(feedType)) {
      return NextResponse.json({ error: 'Invalid feed type' }, { status: 400 });
    }

    // Validate dates
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Start date and end date are required' }, { status: 400 });
    }

    // Try Redis cache first
    const cacheKey = `dashboard-v2:${feedType}:${accountId || 'all'}:${startDate}:${endDate}`;
    const cached = await redisCacheManager.get(cacheKey);

    if (cached.data) {
      console.log(`[DASHBOARD_V2] ✓ Redis cache hit (age: ${Math.round(cached.age / 1000)}s)`);
      return NextResponse.json({
        data: cached.data,
        source: 'redis',
        responseTime: `${cached.age}ms`
      });
    }

    // Query MongoDB (NO GOOGLE API CALLS!)
    const startTime = Date.now();

    const campaigns = await getDashboardCampaigns(
      feedType,
      accountId || 'all',
      startDate,
      endDate
    );

    const queryTime = Date.now() - startTime;

    // Calculate summary
    const summary = campaigns.reduce((acc: any, campaign: any) => ({
      total_clicks: acc.total_clicks + (campaign.clicks || 0),
      total_cost: acc.total_cost + (campaign.cost_usd || 0),
      total_revenue: acc.total_revenue + (campaign.revenue_usd || 0),
      total_profit: acc.total_profit + (campaign.profit_usd || 0)
    }), { total_clicks: 0, total_cost: 0, total_revenue: 0, total_profit: 0 });

    summary.roi = summary.total_cost > 0
      ? ((summary.total_profit / summary.total_cost) * 100).toFixed(2)
      : '0.00';

    const result = {
      campaigns,
      summary,
      metadata: {
        feedType,
        accountId: accountId || 'all',
        startDate,
        endDate,
        campaignCount: campaigns.length
      }
    };

    console.log(`[DASHBOARD_V2] ✓ Query completed in ${queryTime}ms, ${campaigns.length} campaigns`);

    // Cache result (15 minutes TTL)
    await redisCacheManager.set(cacheKey, result, {
      dataType: feedType,
      ttl: 900 // 15 minutes
    });

    return NextResponse.json({
      data: result,
      source: 'mongodb',
      responseTime: `${queryTime}ms`,
      campaignCount: campaigns.length
    });

  } catch (error: any) {
    console.error('[DASHBOARD_V2] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// GET endpoint for simple queries
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const feedType = searchParams.get('feedType') as FeedType;
    const accountId = searchParams.get('accountId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!feedType || !startDate || !endDate) {
      return NextResponse.json({
        error: 'Missing required parameters',
        required: ['feedType', 'startDate', 'endDate']
      }, { status: 400 });
    }

    // Forward to POST handler
    return POST(request);

  } catch (error: any) {
    console.error('[DASHBOARD_V2] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message
    }, { status: 500 });
  }
}
