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

          // CRITICAL FIX: Save cost data from ads array, not clicks array!
          // Google Ads API structure: { campaigns: [...], ads: [...cost data...], clicks: [...GCLIDs...] }
          if (data.data?.ads && data.data.ads.length > 0) {
            const clicks = data.data.ads.map((ad: any) => {
              const clickData: any = {
                account_id: account.id,
                campaign_id: ad.campaign_id || '',
                campaign_name: ad.campaign_name || '',
                ad_group_id: ad.ad_group_id || '',
                ad_group_name: ad.ad_group_name || '',
                ad_id: ad.ad_id || '',
                ad_name: ad.ad_name || '',
                date: yesterday, // Use sync date

                // Cost metrics
                cost_micros: ad.metrics?.cost_micros || 0,
                clicks: ad.metrics?.clicks || 0,
                impressions: ad.metrics?.impressions || 0,
                conversions: ad.metrics?.conversions || 0,
                ctr: ad.metrics?.ctr || 0,
                cpc: ad.metrics?.cost && ad.metrics?.clicks ? ad.metrics.cost / ad.metrics.clicks : 0
              };

              const finalUrl = ad.final_urls && ad.final_urls[0];

              // Extract matching keys based on feed type
              switch (feedType) {
                case 'afs':
                  // Extract style_id and domain for AFS (termuxtools.com)
                  if (finalUrl) {
                    const { extractStyleIdFromUrl, extractDomainFromUrl } = require('@/lib/adsense-api');
                    clickData.style_id = extractStyleIdFromUrl(finalUrl);
                    clickData.domain = extractDomainFromUrl(finalUrl);
                  }
                  break;

                case 'compado':
                  // gclid will be added from click_view data
                  break;

                case 'adscom':
                  // Extract article slug from URL
                  if (finalUrl) {
                    try {
                      const url = new URL(finalUrl);
                      const pathParts = url.pathname.split('/').filter(p => p);
                      clickData.article = pathParts[pathParts.length - 1] || '';
                    } catch (e) {
                      console.error(`[CRON_SYNC] Failed to extract article from ${finalUrl}:`, e);
                    }
                  }
                  break;

                case 'inuvo':
                  // Extract TKID from URL
                  if (finalUrl) {
                    try {
                      const url = new URL(finalUrl);
                      clickData.tkid = url.searchParams.get('tkid') || url.searchParams.get('TKID') || '';
                    } catch (e) {
                      console.error(`[CRON_SYNC] Failed to extract TKID from ${finalUrl}:`, e);
                    }
                  }
                  break;
              }

              // For Compado and Inuvo: try to get GCLID from click_view data
              if ((feedType === 'compado' || feedType === 'inuvo') && data.data?.clicks && data.data.clicks.length > 0) {
                const matchingClick = data.data.clicks.find((c: any) =>
                  c.campaign_id === ad.campaign_id && c.ad_group_id === ad.ad_group_id
                );
                if (matchingClick) {
                  clickData.gclid = matchingClick.gclid || '';
                }
              }

              return clickData;
            }).filter((c: any) => {
              // Filter based on feed type requirements
              switch (feedType) {
                case 'afs':
                  return c.style_id; // AFS requires style_id
                case 'compado':
                  return c.campaign_id; // Compado requires campaign_id (gclid added later)
                case 'adscom':
                  return c.article; // Ads.com requires article
                case 'inuvo':
                  return c.tkid || c.campaign_id; // Inuvo requires tkid
                default:
                  return c.campaign_id;
              }
            });

            if (clicks.length > 0) {
              const savedCount = await saveClicks(clicks, feedType);
              results[feedType].clicks += savedCount;
              console.log(`[CRON_SYNC] ${feedType}: ✓ Saved ${savedCount} cost records (ads) for ${account.id}`);
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
          clicks: conv.clicks || conv.estimated_clicks || 1, // Compado provides clicks
          impressions: conv.impressions || 0,
          date: conv.timestamp ? conv.timestamp.split('T')[0] : yesterday,
          conversion_type: conv.conversion_type,
          device: conv.device,
          country: conv.country,
          traffic_source: conv.traffic_source,
          keywords: conv.keywords || [],
          srcclkid: conv.srcclkid
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

      // Sync ALL AFS accounts (MongoDB + Redis rate limiting protects us now!)
      const afsAccountsToSync = afsAccounts;

      console.log(`[CRON_SYNC] AFS: Syncing ${afsAccountsToSync.length} accounts with MongoDB persistence`);

      for (const account of afsAccountsToSync) {
        try {
          console.log(`[CRON_SYNC] Fetching AFS revenue for account ${account.id}...`);

          // Fetch AdSense revenue by style_id with increased timeout
          const afsData = await Promise.race([
            fetchAdSenseRevenueByStyleId(
              `accounts/${account.id}`, // Fixed: Use direct account ID (AdSense API handles pub- prefix internally)
              yesterday,
              today
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AFS API timeout after 60s')), 60000) // Increased to 60s
            )
          ]) as any[];

          if (afsData.length > 0) {
            const revenues = afsData.map((rev: any) => ({
              style_id: rev.style_id,
              domain: rev.domain_name,
              revenue_usd: rev.earnings,
              revenue_eur: 0, // AFS reports in USD directly
              clicks: rev.clicks || 0, // AdSense provides clicks
              impressions: rev.impressions || 0,
              date: rev.date,
              country_name: rev.country_name
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
            tkid: item.TKID || '', // Inuvo uses TKID (not GCLID!)
            revenue_usd: item.ESTIMATED_EARNINGS || 0,
            revenue_eur: 0, // Inuvo reports in USD
            clicks: item.CLICKS || item.ESTIMATED_CLICKS || 0,
            impressions: item.IMPRESSIONS || item.INDIVIDUAL_AD_IMPRESSIONS || 0,
            date: item.DATE || yesterday,
            agid: item.AGID,
            platform_type: item.PLATFORM_TYPE_CODE,
            ad_requests: item.AD_REQUESTS || 0,
            page_views: item.PAGE_VIEWS || 0,
            estimated_clicks: item.ESTIMATED_CLICKS || 0
          })).filter((r: any) => r.tkid);

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

    // ==================== SYNC ADS.COM REVENUE ====================
    try {
      console.log('[CRON_SYNC] Fetching Ads.com revenue...');

      // Get all Ads.com accounts
      const adscomAccounts = config.TARGET_ACCOUNTS.filter((acc: any) => {
        const accountKey = `CID_${acc.id}`;
        const allowedFeeds = ACCOUNT_FEED_ACCESS[accountKey];
        return allowedFeeds && allowedFeeds.includes('adscom');
      });

      console.log(`[CRON_SYNC] Ads.com: Syncing ${adscomAccounts.length} accounts`);

      // Fetch Ads.com revenue with timeout
      const adscomData = await Promise.race([
        fetchArticlePerformance(yesterday, today),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Ads.com API timeout after 60s')), 60000)
        )
      ]) as any;

      if (adscomData.articles && adscomData.articles.length > 0) {
        const revenues = adscomData.articles.map((article: any) => ({
          article: article.article || article.article_id || '', // Ads.com uses article slug (not GCLID!)
          revenue_usd: article.revenue || article.revenue_usd || 0,
          revenue_eur: 0,
          clicks: article.clicks || 0,
          impressions: article.impressions || 0,
          date: article.date || yesterday,
          visits: article.visits || 0,
          ctr: article.ctr || 0,
          rpm: article.rpm || 0,
          epc: article.epc || 0,
          ivt_correction: article.ivtCorrection || article.ivt_correction || 0,
          finalized: article.finalized || false
        })).filter((r: any) => r.article); // Save if we have article slug

        if (revenues.length > 0) {
          const savedCount = await saveRevenue(revenues, 'adscom');
          results.adscom.revenue = savedCount;
          console.log(`[CRON_SYNC] Ads.com: ✓ Saved ${savedCount} revenue records`);

          // Re-run cost-revenue mapping after saving revenue
          await createCostRevenueMapping('adscom', yesterday, today);
          await aggregateCampaigns('adscom', yesterday, today);
        }
      } else {
        console.log('[CRON_SYNC] Ads.com: No revenue data returned');
      }
    } catch (error: any) {
      console.error('[CRON_SYNC] Ads.com revenue error:', error.message);
      results.adscom.errors.push(`Revenue: ${error.message}`);
    }

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
