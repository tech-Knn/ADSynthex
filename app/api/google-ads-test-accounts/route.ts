import { NextRequest, NextResponse } from 'next/server';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';

/**
 * Test endpoint to check what Google Ads accounts are available
 * GET /api/google-ads-test-accounts?customerId=2382992113
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const testCustomerId = url.searchParams.get('customerId') || '2382992113';
    const startDate = '2026-01-05';
    const endDate = '2026-01-05';

    console.log(`[GOOGLE_ADS_TEST] Testing account: ${testCustomerId}`);

    try {
      const result = await bulletproofAPI.getData(startDate, endDate, testCustomerId, {
        priority: 10,
        allowStale: false,
        maxWait: 10000,
        feedType: 'predicto',
      });

      console.log(`[GOOGLE_ADS_TEST] Success! Campaigns found:`, result.campaigns?.length || 0);

      return NextResponse.json({
        success: true,
        accountId: testCustomerId,
        campaignCount: result.campaigns?.length || 0,
        hasData: result.campaigns && result.campaigns.length > 0,
        sampleCampaign: result.campaigns?.[0] || null,
        source: result._source || 'unknown',
      });
    } catch (error: any) {
      console.error(`[GOOGLE_ADS_TEST] Error for account ${testCustomerId}:`, error.message);

      return NextResponse.json({
        success: false,
        accountId: testCustomerId,
        error: error.message,
        accessible: false,
      });
    }
  } catch (error: any) {
    console.error('[GOOGLE_ADS_TEST] Request error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to test account',
      },
      { status: 500 }
    );
  }
}
