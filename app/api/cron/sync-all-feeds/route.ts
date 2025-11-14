// app/api/cron/sync-all-feeds/route.ts
// Background Sync Job - Syncs Google Ads Cost + Revenue Data to MongoDB

import { NextResponse } from 'next/server';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import {
  saveClicks,
  saveRevenue,
  createCostRevenueMapping,
  aggregateCampaigns,
  updateSyncStatus,
} from '@/lib/db/operations';
import { FeedType } from '@/lib/db/types';
import { ACCOUNT_FEED_ACCESS } from '@/lib/account-access-control';
import config from '@/lib/google-ads-config';
import { fetchAllCompadoConversions } from '@/lib/compado-api';

export const maxDuration = 300; // 5 minutes timeout

export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON_SYNC] ==================== STARTING SYNC ====================');

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const results = {
      adscom: { clicks: 0, revenue: 0, errors: [] as string[] },
      afs: { clicks: 0, revenue: 0, errors: [] as string[] },
      compado: { clicks: 0, revenue: 0, errors: [] as string[] },
      inuvo: { clicks: 0, revenue: 0, errors: [] as string[] }
    };

    // Map 'adsense' to 'afs' for MongoDB compatibility
    const feedTypeMap: Record<string, FeedType> = {
      'adsense': 'afs',
      'adscom': 'adscom',
      'compado': 'compado',
      'inuvo': 'inuvo'
    };

    // ==================== SYNC GOOGLE ADS COST DATA ====================

    const feeds: FeedType[] = ['adscom', 'afs', 'compado', 'inuvo'];

    for (const feedType of feeds) {
      console.log(`\n[CRON_SYNC] ========== Syncing ${feedType.toUpperCase()} ==========`);

      // Get accounts for this feed (handle adsense -> afs mapping)
      const feedAccounts = config.TARGET_ACCOUNTS.filter((acc: any) => {
        const accountKey = `CID_${acc.id}`;
        const allowedFeeds = ACCOUNT_FEED_ACCESS[accountKey];

        if (!allowedFeeds) return false;

        // Check if this account has access to this feed (handle adsense -> afs)
        return allowedFeeds.some(f => feedTypeMap[f] === feedType);
      });

      console.log(`[CRON_SYNC] ${feedType}: ${feedAccounts.length} accounts`);

      // Sync each account
      for (const account of feedAccounts) {
        try {
          await updateSyncStatus(feedType, account.id, 'in_progress');

          console.log(`[CRON_SYNC] ${feedType}: Fetching ${account.id}...`);

          const data = await bulletproofAPI.getData(yesterday, today, account.id, {
            priority: 5,
            allowStale: false,
            feedType: feedType === 'afs' ? 'adsense' : feedType
          });

          // Save clicks to database
          if (data.data?.clicks && data.data.clicks.length > 0) {
            const clicks = data.data.clicks.map((click: any) => ({
              account_id: account.id,
              gclid: click.gclid || click.gclidSegments?.gclid || '',
              campaign_id: click.campaign?.id || click.campaignId || '',
              campaign_name: click.campaign?.name || click.campaignName || '',
              ad_group_id: click.ad_group?.id || click.adGroupId,
              ad_group_name: click.ad_group?.name || click.adGroupName,
              ad_id: click.ad?.id || click.adId,
              ad_name: click.ad?.name || click.adName,
              date: click.date || click.segments?.date || yesterday,
              cost_micros: click.cost_micros || click.metrics?.costMicros || 0,
              clicks: click.clicks || 1,
              impressions: click.impressions || click.metrics?.impressions
            })).filter((c: any) => c.gclid); // Only save clicks with GCLID

            if (clicks.length > 0) {
              const savedCount = await saveClicks(clicks, feedType);
              results[feedType].clicks += savedCount;
              console.log(`[CRON_SYNC] ${feedType}: ✓ Saved ${savedCount} clicks for ${account.id}`);
            }
          }

          await updateSyncStatus(feedType, account.id, 'success');

          // Rate limit protection: 2 seconds between accounts
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error: any) {
          console.error(`[CRON_SYNC] ${feedType}: ✗ Error syncing ${account.id}:`, error.message);
          await updateSyncStatus(feedType, account.id, 'failed', error.message);
          results[feedType].errors.push(`${account.id}: ${error.message}`);
        }
      }

      // Aggregate data for this feed (3 steps for proper cost-revenue mapping)
      try {
        // Step 1: Create cost-revenue mappings (join clicks with revenue)
        const mappingsCount = await createCostRevenueMapping(feedType, yesterday, today);
        console.log(`[CRON_SYNC] ${feedType}: ✓ Created ${mappingsCount} cost-revenue mappings`);

        // Step 2: Aggregate by campaign
        const campaignsCount = await aggregateCampaigns(feedType, yesterday, today);
        console.log(`[CRON_SYNC] ${feedType}: ✓ Aggregated ${campaignsCount} campaigns`);

      } catch (error: any) {
        console.error(`[CRON_SYNC] ${feedType}: ✗ Aggregation error:`, error.message);
        results[feedType].errors.push(`Aggregation: ${error.message}`);
      }
    }

    // ==================== SYNC REVENUE DATA ====================

    console.log(`\n[CRON_SYNC] ========== Syncing Revenue Data ==========`);

    // Compado Revenue
    try {
      console.log('[CRON_SYNC] Fetching Compado revenue...');
      const compadoData = await fetchAllCompadoConversions(yesterday, today);

      if (compadoData.length > 0) {
        const revenues = compadoData.map((conv: any) => ({
          gclid: conv.gclid,
          revenue_usd: conv.revenueUsd || 0,
          revenue_eur: conv.revenue || 0,
          date: conv.timestamp ? conv.timestamp.split('T')[0] : yesterday,
          conversion_type: conv.conversion_type
        })).filter((r: any) => r.gclid);

        if (revenues.length > 0) {
          const savedCount = await saveRevenue(revenues, 'compado');
          results.compado.revenue = savedCount;
          console.log(`[CRON_SYNC] Compado: ✓ Saved ${savedCount} revenue records`);

          // Re-run cost-revenue mapping after saving revenue
          await createCostRevenueMapping('compado', yesterday, today);
          await aggregateCampaigns('compado', yesterday, today);
        }
      }
    } catch (error: any) {
      console.error('[CRON_SYNC] Compado revenue error:', error.message);
      results.compado.errors.push(`Revenue: ${error.message}`);
    }

    // TODO: Add Ads.com, AFS, Inuvo revenue sync when APIs are ready

    console.log('[CRON_SYNC] ==================== SYNC COMPLETE ====================');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dateRange: { start: yesterday, end: today },
      results
    });

  } catch (error: any) {
    console.error('[CRON_SYNC] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
