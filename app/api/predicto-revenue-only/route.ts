import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';
import { cookies } from 'next/headers';

/**
 * Predicto Revenue-Only API
 * Shows revenue grouped by custom_channel_id (cid parameter from tracking URLs)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    console.log(`[PREDICTO_REVENUE] Fetching revenue from ${startDate} to ${endDate}`);

    // Fetch Predicto revenue data grouped by custom_channel_id
    const revenueData = await predictoApiClient.fetchRevenueData({
      start_date: startDate,
      end_date: endDate,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id', 'date'],
    });

    console.log(`[PREDICTO_REVENUE] Retrieved ${revenueData.length} records`);

    // Group by channel and aggregate
    const channelMap = new Map<string, any>();

    revenueData.forEach(record => {
      const channelId = record.custom_channel_id || record.campaign_id || 'unknown';

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          channel_id: channelId,
          revenue: 0,
          clicks: 0,
          impressions: 0,
          dates: new Set(),
        });
      }

      const channel = channelMap.get(channelId)!;
      channel.revenue += record.revenue || 0;
      channel.clicks += record.clicks || 0;
      channel.impressions += record.impressions || 0;
      channel.dates.add(record.date);
    });

    // Convert to array and calculate metrics
    const channels = Array.from(channelMap.values()).map(ch => ({
      channel_id: ch.channel_id,
      revenue: ch.revenue,
      clicks: ch.clicks,
      impressions: ch.impressions,
      rpc: ch.clicks > 0 ? ch.revenue / ch.clicks : 0,
      ctr: ch.impressions > 0 ? (ch.clicks / ch.impressions) * 100 : 0,
      days_active: ch.dates.size,
    }));

    // Sort by revenue descending
    channels.sort((a, b) => b.revenue - a.revenue);

    // Calculate summary
    const summary = {
      total_channels: channels.length,
      total_revenue: channels.reduce((sum, ch) => sum + ch.revenue, 0),
      total_clicks: channels.reduce((sum, ch) => sum + ch.clicks, 0),
      total_impressions: channels.reduce((sum, ch) => sum + ch.impressions, 0),
      average_rpc: 0,
      average_ctr: 0,
    };

    summary.average_rpc = summary.total_clicks > 0 ? summary.total_revenue / summary.total_clicks : 0;
    summary.average_ctr = summary.total_impressions > 0 ? (summary.total_clicks / summary.total_impressions) * 100 : 0;

    console.log(`[PREDICTO_REVENUE] Summary: ${channels.length} channels, $${summary.total_revenue.toFixed(2)} revenue`);

    return NextResponse.json({
      success: true,
      date_range: { startDate, endDate },
      channels,
      summary,
      _source: 'predicto-api',
      _timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[PREDICTO_REVENUE] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Predicto revenue data',
      },
      { status: 500 }
    );
  }
}
