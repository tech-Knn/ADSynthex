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
import { fetchAdSenseRevenueByStyleId } from '@/lib/adsense-api';
import { fetchInuvoRealtimeData } from '@/lib/inuvo-api';
import { fetchArticlePerformance } from '@/lib/adscom-api';

export const maxDuration = 300; // 5 minutes timeout
export const dynamic = 'force-dynamic'; // Required for headers access

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
            const clicks = data.data.clicks.map((click: any) => {
              const clickData: any = {
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
              };

              // For AFS: Extract style_id and domain from URL
              if (feedType === 'afs') {
                if (click.style_id) {
                  clickData.style_id = click.style_id;
                }
                if (click.domain) {
                  clickData.domain = click.domain;
                }
              }

              return clickData;
            }).filter((c: any) => {
              // For AFS: require either GCLID or style_id
              if (feedType === 'afs') {
                return c.gclid || c.style_id;
              }
              // For other feeds: require GCLID
              return c.gclid;
            });

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

    // ==================== SYNC AFS (ADSENSE) REVENUE ====================
    try {
      console.log('[CRON_SYNC] Fetching AFS (AdSense) revenue...');

      // Get all AFS accounts
      const afsAccounts = config.TARGET_ACCOUNTS.filter((acc: any) => {
        const accountKey = `CID_${acc.id}`;
        const allowedFeeds = ACCOUNT_FEED_ACCESS[accountKey];
        return allowedFeeds && allowedFeeds.includes('adsense');
      });

      let totalAfsSaved = 0;

      // Only sync first 5 AFS accounts to avoid rate limits
      const afsAccountsToSync = afsAccounts.slice(0, 5);

      if (afsAccountsToSync.length < afsAccounts.length) {
        console.log(`[CRON_SYNC] AFS: Limiting to ${afsAccountsToSync.length} accounts to avoid rate limits`);
      }

      for (const account of afsAccountsToSync) {
        try {
          console.log(`[CRON_SYNC] Fetching AFS revenue for account ${account.id}...`);

          // Fetch AdSense revenue by style_id with timeout
          const afsData = await Promise.race([
            fetchAdSenseRevenueByStyleId(
              `accounts/pub-${account.id}`,
              yesterday,
              today
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AFS API timeout after 30s')), 30000)
            )
          ]) as any[];

          if (afsData.length > 0) {
            const revenues = afsData.map((rev: any) => ({
              gclid: '', // AFS doesn't use GCLID
              style_id: rev.style_id,
              domain: rev.domain_name,
              revenue_usd: rev.earnings,
              revenue_eur: 0, // AFS reports in USD directly
              date: rev.date,
            })).filter((r: any) => r.style_id); // Only save records with style_id

            if (revenues.length > 0) {
              const savedCount = await saveRevenue(revenues, 'afs');
              totalAfsSaved += savedCount;
              results.afs.revenue += savedCount;
              console.log(`[CRON_SYNC] AFS: ✓ Saved ${savedCount} revenue records for ${account.id}`);
            }
          }

          // Rate limit protection: 3 seconds between AFS accounts (Google API has stricter limits)
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error: any) {
          console.error(`[CRON_SYNC] AFS: ✗ Error fetching revenue for ${account.id}:`, error.message);
          results.afs.errors.push(`${account.id} revenue: ${error.message}`);
          // Continue with next account even if one fails
        }
      }

      if (totalAfsSaved > 0) {
        // Re-run cost-revenue mapping after saving revenue
        await createCostRevenueMapping('afs', yesterday, today);
        await aggregateCampaigns('afs', yesterday, today);
        console.log(`[CRON_SYNC] AFS: ✓ Total ${totalAfsSaved} revenue records saved and mapped`);
      }
    } catch (error: any) {
      console.error('[CRON_SYNC] AFS revenue error:', error.message);
      results.afs.errors.push(`Revenue: ${error.message}`);
    }

    // ==================== SYNC INUVO REVENUE ====================
    try {
      console.log('[CRON_SYNC] Fetching Inuvo revenue...');

      // Get all Inuvo accounts
      const inuvoAccounts = config.TARGET_ACCOUNTS.filter((acc: any) => {
        const accountKey = `CID_${acc.id}`;
        const allowedFeeds = ACCOUNT_FEED_ACCESS[accountKey];
        return allowedFeeds && allowedFeeds.includes('inuvo');
      });

      if (inuvoAccounts.length > 0) {
        // Fetch realtime data for all accounts with timeout
        const inuvoData = await Promise.race([
          fetchInuvoRealtimeData(yesterday, today),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Inuvo API timeout after 45s')), 45000)
          )
        ]) as any;

        if (inuvoData.data && inuvoData.data.length > 0) {
          const revenues = inuvoData.data.map((item: any) => ({
            gclid: item.TKID || '', // Use TKID as identifier
            revenue_usd: item.ESTIMATED_EARNINGS || 0,
            revenue_eur: 0, // Inuvo reports in USD
            date: item.DATE || yesterday,
            article_id: item.TKID,
          })).filter((r: any) => r.gclid);

          if (revenues.length > 0) {
            const savedCount = await saveRevenue(revenues, 'inuvo');
            results.inuvo.revenue = savedCount;
            console.log(`[CRON_SYNC] Inuvo: ✓ Saved ${savedCount} revenue records`);

            // Re-run cost-revenue mapping after saving revenue
            await createCostRevenueMapping('inuvo', yesterday, today);
            await aggregateCampaigns('inuvo', yesterday, today);
          }
        } else {
          console.log('[CRON_SYNC] Inuvo: No data returned');
        }
      }
    } catch (error: any) {
      console.error('[CRON_SYNC] Inuvo revenue error:', error.message);
      results.inuvo.errors.push(`Revenue: ${error.message}`);
    }

    // Note: Ads.com revenue sync is handled differently as it doesn't use GCLID/TKID
    // Ads.com data is fetched directly via the /api/adscom route when needed

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
