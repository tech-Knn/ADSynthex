import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET,
});

const refreshToken = process.env.ADSENSE_REFRESH_TOKEN || process.env.GOOGLE_ADS_REFRESH_TOKEN;
if (refreshToken) {
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });
}

async function getAccessToken(): Promise<string> {
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error('Failed to get AdSense access token');
  return token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, adsenseAccountId } = body;

    console.log('=== ADSENSE REVENUE TEST ===');
    console.log('Date Range:', startDate, 'to', endDate);
    console.log('Account:', adsenseAccountId);

    if (!startDate || !endDate || !adsenseAccountId) {
      return NextResponse.json({
        error: 'Missing required fields: startDate, endDate, adsenseAccountId'
      }, { status: 400 });
    }

    // Get access token
    const token = await getAccessToken();
    console.log('✓ Access token obtained');

    // Split dates
    const startParts = startDate.split('-');
    const endParts = endDate.split('-');

    // Build AdSense API request
    const url = new URL(`https://adsense.googleapis.com/v2/${adsenseAccountId}/reports:generate`);
    url.searchParams.set('dateRange', 'CUSTOM');
    url.searchParams.set('startDate.year', startParts[0]);
    url.searchParams.set('startDate.month', startParts[1]);
    url.searchParams.set('startDate.day', startParts[2]);
    url.searchParams.set('endDate.year', endParts[0]);
    url.searchParams.set('endDate.month', endParts[1]);
    url.searchParams.set('endDate.day', endParts[2]);

    // Metrics
    url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
    url.searchParams.append('metrics', 'IMPRESSIONS');
    url.searchParams.append('metrics', 'CLICKS');

    // Dimensions - testing what's available
    url.searchParams.append('dimensions', 'DATE');
    url.searchParams.append('dimensions', 'CUSTOM_SEARCH_STYLE_ID');
    url.searchParams.append('dimensions', 'COUNTRY_NAME');
    url.searchParams.append('dimensions', 'DOMAIN_NAME');

    console.log('API URL:', url.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Response Status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('API Error:', error.substring(0, 500));
      return NextResponse.json({
        error: 'AdSense API error',
        status: response.status,
        details: error.substring(0, 500)
      }, { status: response.status });
    }

    const data = await response.json();

    console.log('✓ Data received');
    console.log('Total Rows:', data.totalMatchedRows);
    console.log('Headers:', data.headers?.length);
    console.log('Rows:', data.rows?.length);

    // Parse and structure the data
    const revenues = [];

    if (data.rows) {
      console.log('\n=== SAMPLE DATA (first 5 rows) ===');
      for (let i = 0; i < Math.min(5, data.rows.length); i++) {
        const row = data.rows[i];
        const cells = row.cells;

        const revenueItem = {
          date: cells[0]?.value || '',
          style_id: cells[1]?.value || '',
          country_name: cells[2]?.value || '',
          domain_name: cells[3]?.value || '',
          earnings: parseFloat(cells[4]?.value || '0'),
          impressions: parseInt(cells[5]?.value || '0', 10),
          clicks: parseInt(cells[6]?.value || '0', 10),
        };

        console.log(`Row ${i + 1}:`, JSON.stringify(revenueItem, null, 2));
        revenues.push(revenueItem);
      }
    }

    // Parse all rows
    const allRevenues = (data.rows || []).map((row: any) => {
      const cells = row.cells;
      return {
        date: cells[0]?.value || '',
        style_id: cells[1]?.value || '',
        country_name: cells[2]?.value || '',
        domain_name: cells[3]?.value || '',
        earnings: parseFloat(cells[4]?.value || '0'),
        impressions: parseInt(cells[5]?.value || '0', 10),
        clicks: parseInt(cells[6]?.value || '0', 10),
      };
    }).filter((r: any) => r.style_id && r.style_id !== '(not set)');

    console.log('✓ Parsed', allRevenues.length, 'revenue records');

    // Calculate totals
    const totals = {
      totalEarnings: allRevenues.reduce((sum: number, r: any) => sum + r.earnings, 0),
      totalImpressions: allRevenues.reduce((sum: number, r: any) => sum + r.impressions, 0),
      totalClicks: allRevenues.reduce((sum: number, r: any) => sum + r.clicks, 0),
    };

    console.log('Totals:', totals);

    return NextResponse.json({
      success: true,
      account: adsenseAccountId,
      dateRange: { startDate, endDate },
      summary: {
        totalRows: data.totalMatchedRows,
        parsedRows: allRevenues.length,
        uniqueStyleIds: new Set(allRevenues.map((r: any) => r.style_id)).size,
        uniqueDomains: new Set(allRevenues.map((r: any) => r.domain_name)).size,
        ...totals
      },
      sampleData: revenues.slice(0, 10),
      allRevenues: allRevenues,
      rawHeaders: data.headers,
      _timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('ERROR:', error.message);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST with { startDate, endDate, adsenseAccountId }',
    example: {
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      adsenseAccountId: 'accounts/pub-1234567890'
    }
  });
}
