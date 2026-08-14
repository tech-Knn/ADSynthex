import { prisma } from './prisma';
import { fetchGoogleAdsDataForSync, fetchCampaignCountries } from './google-ads-api';

import {
  fetchAdSenseRevenueByStyleId,
  extractChannelIdFromUrl,
  type AdSenseRevenue,
} from './adsense-api';
import {
  bulkUpsertAdsDaily,
  bulkUpsertAdsenseDaily,
  bulkUpsertCampaigns,
  type AdsRow,
  type AdsenseRow,
} from './bulk-upsert';

const FEED = 'androidadvice';

export interface SyncResult {
  startDate: string;
  endDate: string;
  accountsProcessed: number;
  campaignsUpserted: number;
  adsDailyUpserted: number;
  adsenseDailyUpserted: number;
  durationMs: number;
  errors: string[];
}

export async function syncRange(
  startDate: string,
  endDate: string,
  accountIds?: string[]
): Promise<SyncResult> {
  const t0 = Date.now();
  const errors: string[] = [];

  console.log(`\n[SYNC] ===== ${startDate} -> ${endDate} =====`);

  // Sync run counter — har 5th run pe country refresh (country daily nahi badalta)
  let refreshCountry = false;
  try {
    const cRow = await prisma.$queryRaw<any[]>`SELECT value FROM app_settings WHERE key = 'sync_run_count'`;
    const runCount = parseInt(cRow?.[0]?.value || '0') + 1;
    await prisma.$executeRaw`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('sync_run_count', ${String(runCount)}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${String(runCount)}, updated_at = NOW()
    `;
    refreshCountry = (runCount % 5 === 0);
    console.log(`[SYNC] run #${runCount}, refreshCountry: ${refreshCountry}`);
  } catch (e: any) {
    console.warn(`[SYNC] run counter failed: ${e?.message}`);
  }

  let targets: string[];
  if (accountIds?.length) {
    targets = accountIds;
  } else {
    const rows = await prisma.account.findMany({
      where: { feedName: FEED, active: true },
      select: { cid: true },
    });
    targets = rows.map((r) => r.cid);
  }

  if (targets.length === 0) {
    return {
      startDate, endDate, accountsProcessed: 0,
      campaignsUpserted: 0, adsDailyUpserted: 0, adsenseDailyUpserted: 0,
      durationMs: Date.now() - t0, errors: ['no accounts in db'],
    };
  }

  console.log(`[SYNC] ${targets.length} account(s) to sync`);

  const campaignRows: { accountCid: string; campaignId: string; name: string; status: string; country: string }[] = [];
  const adsRows: AdsRow[] = [];
  const channelToAccount = new Map<string, string>();

  for (const cid of targets) {
    try {
      console.log(`[SYNC] Google Ads: account ${cid}...`);
      const data = await fetchGoogleAdsDataForSync(startDate, endDate, cid, FEED as any);
      const campaigns = data.campaigns || [];
      const ads = data.ads || [];
      console.log(`[SYNC]   ${campaigns.length} campaign rows, ${ads.length} ads`);

      // Country — sirf har 5th run pe (campaign_criterion se geo_id, phir geo_countries se code)
      let campaignCountry = new Map<string, string>(); // campaignId → country code
      if (refreshCountry) {
        const campaignGeo = await fetchCampaignCountries(cid, startDate, endDate); // dates add
        if (campaignGeo.size > 0) {
          const geoIds = [...new Set(campaignGeo.values())];
          const codes = await prisma.$queryRaw<any[]>`
            SELECT geo_id, country_code FROM geo_countries WHERE geo_id = ANY(${geoIds})
          `;
          const geoToCode = new Map(codes.map((c: any) => [c.geo_id, c.country_code]));
          for (const [campId, geoId] of campaignGeo) {
            campaignCountry.set(campId, geoToCode.get(geoId) || '');
          }
        }
      }

      const seen = new Set<string>();
      for (const c of campaigns) {
        const campaignId = String(c.campaign_id);
        if (seen.has(campaignId)) continue;
        seen.add(campaignId);
        campaignRows.push({
          accountCid: cid,
          campaignId,
          name: c.campaign_name || '',
          status: String(c.campaign_status || ''),
          country: campaignCountry.get(campaignId) || (c as any).country || '',
        });
      }

      const channelByCampaign = new Map<string, string>();
      for (const ad of ads) {
        const campaignId = String(ad.campaign_id);
        for (const url of ad.final_urls || []) {
          const ch = extractChannelIdFromUrl(url);
          if (ch) {
            channelByCampaign.set(campaignId, ch);
            channelToAccount.set(ch, cid);
            break;
          }
        }
      }

      const dedupeAds = new Set<string>();
      for (const c of campaigns) {
        const campaignId = String(c.campaign_id);
        const date = c.segments?.date || c.date;
        if (!date) continue;
        const channelId = channelByCampaign.get(campaignId) || '';
        const key = `${cid}|${campaignId}|${channelId}|${date}`;
        if (dedupeAds.has(key)) continue;
        dedupeAds.add(key);
        const m: any = c.metrics || {};
        adsRows.push({
          accountCid: cid,
          campaignId,
          channelId,
          date,
          costMicros: BigInt(Math.round(m.cost_micros || 0)),
          clicks: Math.round(m.clicks || 0),
          impressions: Math.round(m.impressions || 0),
          conversions: m.conversions || 0,
        });
      }
    } catch (err: any) {
      const msg = `account ${cid}: ${err?.message || err}`;
      console.error(`[SYNC] x ${msg}`);
      errors.push(msg);
    }
  }

  console.log(`[SYNC] Writing ${campaignRows.length} campaigns, ${adsRows.length} ads_daily rows...`);
  let campaignsUpserted = 0;
  let adsDailyUpserted = 0;
  try {
    campaignsUpserted = await bulkUpsertCampaigns(campaignRows);
    adsDailyUpserted = await bulkUpsertAdsDaily(adsRows);
  } catch (err: any) {
    const msg = `bulk cost write: ${err?.message || err}`;
    console.error(`[SYNC] x ${msg}`);
    errors.push(msg);
  }

  let adsenseDailyUpserted = 0;
  try {
    const feed = await prisma.feed.findUnique({ where: { feedName: FEED } });
    const publisherId = feed?.publisherId || process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) throw new Error('publisher id missing');

    console.log(`[SYNC] AdSense: publisher ${publisherId}...`);
    const revenues: AdSenseRevenue[] = await fetchAdSenseRevenueByStyleId(
      publisherId, startDate, endDate, undefined, FEED as any
    );
    console.log(`[SYNC]   ${revenues.length} revenue rows`);

    const adsenseRows: AdsenseRow[] = [];
    const dedupe = new Set<string>();
    for (const rev of revenues) {
      const channelId = rev.style_id;
      if (!channelId || !rev.date) continue;
      const country = rev.country_name || '';
      const key = `${channelId}|${rev.date}|${country}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      adsenseRows.push({
        channelId,
        date: rev.date,
        country,
        accountCid: channelToAccount.get(channelId) ?? null,
        earnings: rev.earnings || 0,
        clicks: Math.round(rev.clicks || 0),
        impressions: Math.round(rev.impressions || 0),
      });
    }

    console.log(`[SYNC] Writing ${adsenseRows.length} adsense_daily rows...`);
    adsenseDailyUpserted = await bulkUpsertAdsenseDaily(adsenseRows);
    try {
      const domainUpdated = await prisma.$executeRaw`
        UPDATE adsense_daily
        SET domain = 'androidadvices.com'
        WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
        AND domain IS DISTINCT FROM 'androidadvices.com'
        AND channel_id IN (
          SELECT DISTINCT channel_id FROM ads_daily
          WHERE date BETWEEN ${startDate}::date AND ${endDate}::date AND channel_id != ''
        )
      `;
      console.log(`[SYNC] Domain tagged: ${domainUpdated} adsense rows → androidadvices.com`);
    } catch (e: any) {
      console.warn(`[SYNC] domain tagging failed: ${e?.message}`);
    }
  } catch (err: any) {
    const msg = `adsense: ${err?.message || err}`;
    console.error(`[SYNC] x ${msg}`);
    errors.push(msg);
  }

  const result: SyncResult = {
    startDate, endDate,
    accountsProcessed: targets.length,
    campaignsUpserted, adsDailyUpserted, adsenseDailyUpserted,
    durationMs: Date.now() - t0,
    errors,
  };

  console.log(`[SYNC] ===== DONE in ${(result.durationMs / 1000).toFixed(1)}s =====`);
  console.log(`[SYNC] campaigns=${campaignsUpserted} ads_daily=${adsDailyUpserted} adsense_daily=${adsenseDailyUpserted} errors=${errors.length}\n`);

  // Har sync ka snapshot — history ke liye (har 10 min ka data dekhne ko)
  try {
    const snapshot = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(SUM(cost_micros),0)/1e6 AS total_cost,
        COALESCE(SUM(clicks),0) AS total_clicks,
        COALESCE(SUM(conversions),0) AS total_conversions,
        COUNT(DISTINCT account_cid) AS accounts_count,
        COUNT(*) AS ads_rows
      FROM ads_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    const rev = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(earnings),0) AS total_revenue, COUNT(*) AS adsense_rows
      FROM adsense_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    const s = snapshot[0] || {};
    const r = rev[0] || {};

    // result.errors, result.accountsProcessed already available hain
    const errorCount = result.errors.length;
    const errorText = result.errors.length > 0 ? result.errors.join(' | ').substring(0, 500) : null;
    const syncStatus = result.errors.length > 0 ? 'has_errors'
      : Number(s.ads_rows) === 0 ? 'no_data'
        : 'ok';

    await prisma.$executeRaw`
  INSERT INTO sync_snapshots 
    (sync_date, total_cost, total_revenue, total_clicks, total_conversions, 
     accounts_count, ads_rows, adsense_rows, duration_ms,
     error_count, errors, accounts_processed, sync_status)
  VALUES (
    ${endDate}::date,
    ${Number(s.total_cost) || 0}, ${Number(r.total_revenue) || 0},
    ${Number(s.total_clicks) || 0}, ${Number(s.total_conversions) || 0},
    ${Number(s.accounts_count) || 0}, ${Number(s.ads_rows) || 0}, 
    ${Number(r.adsense_rows) || 0}, ${result.durationMs},
    ${errorCount}, ${errorText}, ${result.accountsProcessed}, ${syncStatus}
  )
`;
    console.log(`[SYNC] Snapshot saved: cost=$${Number(s.total_cost).toFixed(2)}, revenue=$${Number(r.total_revenue).toFixed(2)}`);
  } catch (e: any) {
    console.warn(`[SYNC] snapshot failed: ${e?.message}`);
  }

  return result;
}

export async function bootstrapAccounts(cids: string[]): Promise<number> {
  await prisma.feed.upsert({
    where: { feedName: FEED },
    create: { feedName: FEED, publisherId: process.env.ANDROIDADVICE_PUBLISHER_ID || null },
    update: { publisherId: process.env.ANDROIDADVICE_PUBLISHER_ID || undefined },
  });
  let n = 0;
  for (const cid of cids) {
    await prisma.account.upsert({
      where: { cid },
      create: { cid, feedName: FEED, active: true },
      update: { active: true },
    });
    n++;
  }
  console.log(`[SYNC] Bootstrapped ${n} accounts`);
  return n;
}