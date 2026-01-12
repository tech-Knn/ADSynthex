/**
 * Predicto Channel Discovery Tool
 * Analyzes Predicto data to help determine which channels belong to which account
 */

import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';

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

    console.log(`[CHANNEL_DISCOVERY] Fetching Predicto revenue data from ${startDate} to ${endDate}...`);

    // Fetch all Predicto revenue data
    const predictoRevenue = await predictoApiClient.fetchRevenueData({
      start_date: startDate,
      end_date: endDate,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id', 'date'],
    });

    console.log(`[CHANNEL_DISCOVERY] Retrieved ${predictoRevenue.length} Predicto revenue records`);

    // Aggregate revenue by channel
    const channelStats = new Map<string, {
      revenue: number;
      clicks: number;
      impressions: number;
      days: Set<string>;
    }>();

    predictoRevenue.forEach(record => {
      const channelId = record.custom_channel_id;
      if (!channelId || channelId === 'unknown') return;

      const normalizedId = channelId.toLowerCase();

      if (!channelStats.has(normalizedId)) {
        channelStats.set(normalizedId, {
          revenue: 0,
          clicks: 0,
          impressions: 0,
          days: new Set(),
        });
      }

      const stats = channelStats.get(normalizedId)!;
      stats.revenue += record.revenue || 0;
      stats.clicks += record.clicks || 0;
      stats.impressions += record.impressions || 0;
      if (record.date) {
        stats.days.add(record.date);
      }
    });

    // Convert to array and sort by revenue
    const channelList = Array.from(channelStats.entries()).map(([channelId, stats]) => ({
      channel_id: channelId,
      revenue: stats.revenue,
      clicks: stats.clicks,
      impressions: stats.impressions,
      active_days: stats.days.size,
    })).sort((a, b) => b.revenue - a.revenue);

    console.log(`[CHANNEL_DISCOVERY] Found ${channelList.length} unique channels`);

    // Calculate totals
    const totalRevenue = channelList.reduce((sum, ch) => sum + ch.revenue, 0);
    const totalClicks = channelList.reduce((sum, ch) => sum + ch.clicks, 0);
    const totalImpressions = channelList.reduce((sum, ch) => sum + ch.impressions, 0);

    return NextResponse.json({
      summary: {
        total_channels: channelList.length,
        total_revenue: totalRevenue,
        total_clicks: totalClicks,
        total_impressions: totalImpressions,
        date_range: { start: startDate, end: endDate },
      },
      channels: channelList,
      _message: 'Use this data to populate lib/predicto-channel-ownership.ts',
      _instructions: [
        '1. Review the channel list below',
        '2. For each account (EST-01 through EST-08), identify which channels belong to it',
        '3. Update lib/predicto-channel-ownership.ts with the correct channel IDs',
        '4. Channels with high revenue are likely the main channels for that account',
      ],
    });

  } catch (error: any) {
    console.error('[CHANNEL_DISCOVERY] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to discover channels',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
