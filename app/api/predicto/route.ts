import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';
import { buildPredictoTrackingUrl, isValidPredictoUrl, parsePredictoUrl } from '@/lib/predicto-url-builder';

/**
 * POST /api/predicto
 * Fetch Predicto revenue data or generate tracking URLs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, startDate, endDate, domain, articleId, channelId, url } = body;

    console.log(`[Predicto API] POST request - Action: ${action || 'revenue'}`);

    // Handle different actions
    switch (action) {
      case 'generate-url':
        // Generate tracking URL
        if (!domain || !articleId || !channelId) {
          return NextResponse.json(
            { error: 'Missing required parameters: domain, articleId, and channelId are required' },
            { status: 400 }
          );
        }

        const generatedUrl = buildPredictoTrackingUrl({
          domain,
          articleId,
          channelId,
        });

        return NextResponse.json(
          {
            success: true,
            url: generatedUrl.url,
            template: generatedUrl.template,
            params: generatedUrl.params,
            macros: generatedUrl.googleAdsMacros,
          },
          {
            headers: {
              'Cache-Control': 'no-cache',
              'Content-Type': 'application/json',
            },
          }
        );

      case 'validate-url':
        // Validate tracking URL
        if (!url) {
          return NextResponse.json(
            { error: 'Missing required parameter: url' },
            { status: 400 }
          );
        }

        const isValid = isValidPredictoUrl(url);
        const parsed = parsePredictoUrl(url);

        return NextResponse.json(
          {
            valid: isValid,
            parsed,
          },
          {
            headers: {
              'Cache-Control': 'no-cache',
              'Content-Type': 'application/json',
            },
          }
        );

      case 'revenue-by-campaign':
        // Fetch revenue aggregated by campaign
        if (!startDate) {
          return NextResponse.json(
            { error: 'Missing required parameter: startDate' },
            { status: 400 }
          );
        }

        const campaignRevenue = await predictoApiClient.fetchRevenueByCampaign(
          startDate,
          endDate
        );

        // Convert Map to array for JSON response
        const campaignArray = Array.from(campaignRevenue.entries()).map(([campaignId, data]) => ({
          campaign_id: campaignId,
          impressions: data.impressions || 0,
          clicks: data.clicks || 0,
          revenue: data.revenue || 0,
          ctr: data.clicks && data.impressions ? (data.clicks / data.impressions) * 100 : 0,
          rpc: data.clicks ? data.revenue / data.clicks : 0,
        }));

        return NextResponse.json(
          {
            success: true,
            data: campaignArray,
            total_campaigns: campaignArray.length,
            date_range: { startDate, endDate },
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=900', // 15 minutes
              'Content-Type': 'application/json',
            },
          }
        );

      case 'daily-revenue':
        // Fetch daily revenue breakdown
        if (!startDate) {
          return NextResponse.json(
            { error: 'Missing required parameter: startDate' },
            { status: 400 }
          );
        }

        const dailyData = await predictoApiClient.fetchDailyRevenue(startDate, endDate);

        return NextResponse.json(
          {
            success: true,
            data: dailyData,
            total_records: dailyData.length,
            date_range: { startDate, endDate },
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=900', // 15 minutes
              'Content-Type': 'application/json',
            },
          }
        );

      default:
        // Default: Fetch all revenue data
        if (!startDate) {
          return NextResponse.json(
            { error: 'Missing required parameter: startDate' },
            { status: 400 }
          );
        }

        const revenueData = await predictoApiClient.fetchRevenueData({
          start_date: startDate,
          end_date: endDate,
          metrics: ['impressions', 'clicks', 'revenue'],
          dimensions: ['custom_channel_id', 'date'],
        });

        return NextResponse.json(
          {
            success: true,
            data: revenueData,
            total_records: revenueData.length,
            date_range: { startDate, endDate },
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=900', // 15 minutes
              'Content-Type': 'application/json',
            },
          }
        );
    }
  } catch (error: any) {
    console.error('[Predicto API] Error processing request:', error);

    const statusCode = error.message.includes('Missing') || error.message.includes('Invalid') ? 400 : 500;

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process Predicto request',
        message: error.message || 'Unknown error',
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * GET /api/predicto
 * Fetch Predicto revenue data using query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const action = url.searchParams.get('action') || 'revenue';
    const campaignId = url.searchParams.get('campaignId');

    console.log(`[Predicto API] GET request - Action: ${action}, Date range: ${startDate} to ${endDate}`);

    // Validate required parameters
    if (!startDate) {
      return NextResponse.json(
        { error: 'Missing required parameter: startDate' },
        { status: 400 }
      );
    }

    // Handle campaign-specific query
    if (action === 'campaign' && campaignId) {
      const allData = await predictoApiClient.fetchRevenueData({
        start_date: startDate,
        end_date: endDate,
        metrics: ['impressions', 'clicks', 'revenue'],
        dimensions: ['campaign_id', 'date'],
      });

      // Filter for specific campaign
      const campaignData = allData.filter((record) => record.campaign_id === campaignId);

      // Aggregate campaign data
      const aggregated = campaignData.reduce(
        (acc, record) => ({
          campaign_id: campaignId,
          impressions: acc.impressions + (record.impressions || 0),
          clicks: acc.clicks + (record.clicks || 0),
          revenue: acc.revenue + (record.revenue || 0),
        }),
        { campaign_id: campaignId, impressions: 0, clicks: 0, revenue: 0 }
      );

      return NextResponse.json(
        {
          success: true,
          data: aggregated,
          daily_breakdown: campaignData,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=900',
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Handle other actions
    switch (action) {
      case 'revenue-by-campaign':
        const campaignRevenue = await predictoApiClient.fetchRevenueByCampaign(
          startDate,
          endDate
        );

        const campaignArray = Array.from(campaignRevenue.entries()).map(([id, data]) => ({
          campaign_id: id,
          impressions: data.impressions || 0,
          clicks: data.clicks || 0,
          revenue: data.revenue || 0,
          ctr: data.clicks && data.impressions ? (data.clicks / data.impressions) * 100 : 0,
          rpc: data.clicks ? data.revenue / data.clicks : 0,
        }));

        return NextResponse.json(
          {
            success: true,
            data: campaignArray,
            total_campaigns: campaignArray.length,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=900',
              'Content-Type': 'application/json',
            },
          }
        );

      case 'daily-revenue':
        const dailyData = await predictoApiClient.fetchDailyRevenue(startDate, endDate);

        return NextResponse.json(
          {
            success: true,
            data: dailyData,
            total_records: dailyData.length,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=900',
              'Content-Type': 'application/json',
            },
          }
        );

      default:
        const revenueData = await predictoApiClient.fetchRevenueData({
          start_date: startDate,
          end_date: endDate,
          metrics: ['impressions', 'clicks', 'revenue'],
          dimensions: ['custom_channel_id', 'date'],
        });

        return NextResponse.json(
          {
            success: true,
            data: revenueData,
            total_records: revenueData.length,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=900',
              'Content-Type': 'application/json',
            },
          }
        );
    }
  } catch (error: any) {
    console.error('[Predicto API] Error processing GET request:', error);

    const statusCode = error.message.includes('Missing') || error.message.includes('Invalid') ? 400 : 500;

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch Predicto data',
        message: error.message || 'Unknown error',
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
