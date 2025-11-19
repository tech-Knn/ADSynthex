// Manual AFS Sync Endpoint - Force sync specific date range
import { NextRequest, NextResponse } from 'next/server';
import { fetchAdSenseRevenueByStyleId } from '@/lib/adsense-api';
import { saveRevenue, createCostRevenueMapping, aggregateCampaigns } from '@/lib/db/operations';
import { ACCOUNT_FEED_ACCESS } from '@/lib/account-access-control';
import config from '@/lib/google-ads-config';

export const maxDuration = 300; // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, secret } = await request.json();

    // Security check
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 });
    }

    console.log('[MANUAL_AFS_SYNC] ==================== STARTING MANUAL SYNC ====================');
    console.log(`[MANUAL_AFS_SYNC] Date range: ${startDate} to ${endDate}`);

    // Get all AFS accounts
    const afsAccounts = config.TARGET_ACCOUNTS.filter((acc: any) => {
      const accountKey = `CID_${acc.id}`;
      const allowedFeeds = ACCOUNT_FEED_ACCESS[accountKey];
      return allowedFeeds && allowedFeeds.includes('adsense');
    });

    console.log(`[MANUAL_AFS_SYNC] Found ${afsAccounts.length} AFS accounts to sync`);

    let totalSaved = 0;
    const errors: string[] = [];
    const successAccounts: string[] = [];

    for (const account of afsAccounts) {
      try {
        console.log(`[MANUAL_AFS_SYNC] ========================================`);
        console.log(`[MANUAL_AFS_SYNC] Syncing account ${account.id}`);
        console.log(`[MANUAL_AFS_SYNC] Date range: ${startDate} to ${endDate}`);

        const afsData = await Promise.race([
          fetchAdSenseRevenueByStyleId(
            `accounts/${account.id}`,
            startDate,
            endDate
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout after 60s')), 60000)
          )
        ]) as any[];

        console.log(`[MANUAL_AFS_SYNC] Received ${afsData.length} records for ${account.id}`);

        if (afsData.length > 0) {
          // Log date breakdown
          const dateBreakdown = afsData.reduce((acc: any, rev: any) => {
            const date = rev.date;
            if (!acc[date]) {
              acc[date] = { count: 0, totalRevenue: 0 };
            }
            acc[date].count++;
            acc[date].totalRevenue += rev.earnings || 0;
            return acc;
          }, {});

          console.log(`[MANUAL_AFS_SYNC] Date breakdown for ${account.id}:`);
          Object.keys(dateBreakdown).sort().forEach(date => {
            const info = dateBreakdown[date];
            console.log(`[MANUAL_AFS_SYNC]   ${date}: ${info.count} records, $${info.totalRevenue.toFixed(2)}`);
          });

          const revenues = afsData.map((rev: any) => ({
            style_id: rev.style_id,
            domain: rev.domain_name,
            revenue_usd: rev.earnings,
            revenue_eur: 0,
            clicks: rev.clicks || 0,
            impressions: rev.impressions || 0,
            date: rev.date,
            country_name: rev.country_name
          })).filter((r: any) => r.style_id);

          if (revenues.length > 0) {
            const savedCount = await saveRevenue(revenues, 'afs');
            totalSaved += savedCount;
            successAccounts.push(account.id);
            console.log(`[MANUAL_AFS_SYNC] ✓ Saved ${savedCount} records for ${account.id}`);
          } else {
            console.warn(`[MANUAL_AFS_SYNC] ⚠️  No valid records (missing style_id) for ${account.id}`);
          }
        } else {
          console.error(`[MANUAL_AFS_SYNC] ✗ NO DATA from AdSense API for ${account.id}`);
          errors.push(`${account.id}: No data returned`);
        }

        // Rate limit: 3 seconds between accounts
        await new Promise(resolve => setTimeout(resolve, 3000));

      } catch (error: any) {
        console.error(`[MANUAL_AFS_SYNC] ✗ Error for ${account.id}:`, error.message);
        errors.push(`${account.id}: ${error.message}`);
      }
    }

    // Run aggregation if we saved any data
    if (totalSaved > 0) {
      console.log(`[MANUAL_AFS_SYNC] Running aggregation for ${startDate} to ${endDate}...`);
      await createCostRevenueMapping('afs', startDate, endDate);
      await aggregateCampaigns('afs', startDate, endDate);
      console.log(`[MANUAL_AFS_SYNC] ✓ Aggregation complete`);
    }

    console.log('[MANUAL_AFS_SYNC] ==================== SYNC COMPLETE ====================');

    return NextResponse.json({
      success: true,
      dateRange: { startDate, endDate },
      totalRecordsSaved: totalSaved,
      accountsProcessed: afsAccounts.length,
      successfulAccounts: successAccounts,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[MANUAL_AFS_SYNC] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Manual AFS Sync Endpoint',
    usage: 'POST with { startDate, endDate, secret } to trigger sync',
    example: { startDate: '2025-11-18', endDate: '2025-11-18', secret: 'your_cron_secret' }
  });
}
