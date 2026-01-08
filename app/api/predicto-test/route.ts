import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';

/**
 * Simple test endpoint to verify Predicto API is working
 * GET /api/predicto-test?startDate=2026-01-05&endDate=2026-01-05
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || '2026-01-05';
    const endDate = url.searchParams.get('endDate') || startDate;

    console.log(`[PREDICTO_TEST] Fetching revenue data from ${startDate} to ${endDate}`);

    const revenueData = await predictoApiClient.fetchRevenueData({
      start_date: startDate,
      end_date: endDate,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id', 'date'],
    });

    console.log(`[PREDICTO_TEST] Retrieved ${revenueData.length} records`);

    // Calculate totals
    const totalRevenue = revenueData.reduce((sum, record) => sum + (record.revenue || 0), 0);
    const totalClicks = revenueData.reduce((sum, record) => sum + (record.clicks || 0), 0);
    const totalImpressions = revenueData.reduce((sum, record) => sum + (record.impressions || 0), 0);

    return NextResponse.json({
      success: true,
      date_range: { startDate, endDate },
      total_records: revenueData.length,
      summary: {
        total_revenue: totalRevenue,
        total_clicks: totalClicks,
        total_impressions: totalImpressions,
        rpc: totalClicks > 0 ? totalRevenue / totalClicks : 0,
      },
      data: revenueData,
    });
  } catch (error: any) {
    console.error('[PREDICTO_TEST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Predicto data',
      },
      { status: 500 }
    );
  }
}
