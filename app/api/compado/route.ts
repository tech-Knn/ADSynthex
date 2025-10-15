import { NextRequest, NextResponse } from 'next/server';
import { CompadoConversionService } from '@/src/domain/services/CompadoConversionService';

const conversionService = new CompadoConversionService();

/**
 * POST /api/compado
 * Fetch Compado conversions for a date range
 */
export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, action } = await request.json();

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate and endDate' },
        { status: 400 }
      );
    }

    console.log(`Compado API request: ${action || 'conversions'} for ${startDate} to ${endDate}`);

    // Handle different actions
    switch (action) {
      case 'stats':
        const stats = await conversionService.getConversionStats(startDate, endDate);
        return NextResponse.json(stats, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      case 'daily':
        const dailyBreakdown = await conversionService.getDailyBreakdown(startDate, endDate);
        return NextResponse.json(dailyBreakdown, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      case 'campaigns':
        const campaigns = await conversionService.getCampaignPerformance(startDate, endDate);
        return NextResponse.json(campaigns, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      case 'top-campaigns':
        const topCampaigns = await conversionService.getTopCampaigns(startDate, endDate, 10);
        return NextResponse.json(topCampaigns, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      case 'country-breakdown':
        const countryBreakdown = await conversionService.getConversionsByCountry(startDate, endDate);
        const countryData = Array.from(countryBreakdown.entries()).map(([country, data]) => ({
          country,
          conversions: data.conversions,
          revenue: data.revenue,
          average_revenue: parseFloat((data.revenue / data.conversions).toFixed(4))
        })).sort((a, b) => b.revenue - a.revenue);

        return NextResponse.json(countryData, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      default:
        // Default: Return all conversions
        const conversions = await conversionService.getConversions(startDate, endDate);
        return NextResponse.json({
          data: conversions,
          total: conversions.length,
          date_range: { startDate, endDate }
        }, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });
    }
  } catch (error: any) {
    console.error('Error processing Compado request:', error);

    const statusCode = error.message.includes('Invalid') ? 400 : 500;
    return NextResponse.json(
      {
        error: 'Failed to fetch Compado data',
        message: error.message || 'Unknown error'
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * GET /api/compado
 * Fetch Compado conversions using query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const action = url.searchParams.get('action') || 'conversions';
    const campaignId = url.searchParams.get('campaignId');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate and endDate' },
        { status: 400 }
      );
    }

    console.log(`GET Compado API: ${action} for ${startDate} to ${endDate}`);

    // Handle campaign-specific query
    if (action === 'campaign' && campaignId) {
      const conversions = await conversionService.getConversionsByCampaign(
        campaignId,
        startDate,
        endDate
      );
      return NextResponse.json({
        campaign_id: campaignId,
        data: conversions,
        total: conversions.length
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'Content-Type': 'application/json'
        }
      });
    }

    // Handle other actions
    switch (action) {
      case 'stats':
        const stats = await conversionService.getConversionStats(startDate, endDate);
        return NextResponse.json(stats, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      case 'daily':
        const dailyBreakdown = await conversionService.getDailyBreakdown(startDate, endDate);
        return NextResponse.json(dailyBreakdown, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      case 'campaigns':
        const campaigns = await conversionService.getCampaignPerformance(startDate, endDate);
        return NextResponse.json(campaigns, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });

      default:
        const conversions = await conversionService.getConversions(startDate, endDate);
        return NextResponse.json({
          data: conversions,
          total: conversions.length,
          date_range: { startDate, endDate }
        }, {
          headers: {
            'Cache-Control': 'public, max-age=300',
            'Content-Type': 'application/json'
          }
        });
    }
  } catch (error: any) {
    console.error('Error processing Compado GET request:', error);

    const statusCode = error.message.includes('Invalid') ? 400 : 500;
    return NextResponse.json(
      {
        error: 'Failed to fetch Compado data',
        message: error.message || 'Unknown error'
      },
      {
        status: statusCode,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json'
        }
      }
    );
  }
}
