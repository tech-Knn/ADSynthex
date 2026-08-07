import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const CHUNK = 500;

export interface AdsRow {
  accountCid: string;
  campaignId: string;
  channelId: string;
  date: string;
  costMicros: bigint;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface AdsenseRow {
  channelId: string;
  date: string;
  country: string;
  accountCid: string | null;
  earnings: number;
  clicks: number;
  impressions: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function bulkUpsertAdsDaily(rows: AdsRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const batch of chunk(rows, CHUNK)) {
    const values = batch.map(
      (r) => Prisma.sql`(${r.accountCid}, ${r.campaignId}, ${r.channelId}, ${r.date}::date, ${r.costMicros}::bigint, ${r.clicks}, ${r.impressions}, ${r.conversions}, now())`
    );
    await prisma.$executeRaw`
      INSERT INTO ads_daily
        (account_cid, campaign_id, channel_id, date, cost_micros, clicks, impressions, conversions, synced_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (account_cid, campaign_id, channel_id, date)
      DO UPDATE SET
        cost_micros = EXCLUDED.cost_micros,
        clicks      = EXCLUDED.clicks,
        impressions = EXCLUDED.impressions,
        conversions = EXCLUDED.conversions,
        synced_at   = now()
    `;
    total += batch.length;
  }
  return total;
}

export async function bulkUpsertAdsenseDaily(rows: AdsenseRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const batch of chunk(rows, CHUNK)) {
    const values = batch.map(
      (r) => Prisma.sql`(${r.channelId}, ${r.date}::date, ${r.country}, ${r.accountCid}, ${r.earnings}, ${r.clicks}, ${r.impressions}, now())`
    );
    await prisma.$executeRaw`
      INSERT INTO adsense_daily
        (channel_id, date, country, account_cid, earnings, clicks, impressions, synced_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (channel_id, date, country)
      DO UPDATE SET
        account_cid = EXCLUDED.account_cid,
        earnings    = EXCLUDED.earnings,
        clicks      = EXCLUDED.clicks,
        impressions = EXCLUDED.impressions,
        synced_at   = now()
    `;
    total += batch.length;
  }
  return total;
}

export async function bulkUpsertCampaigns(
  rows: { accountCid: string; campaignId: string; name: string; status: string; country: string }[]
): Promise<number> {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const batch of chunk(rows, CHUNK)) {
    const values = batch.map(
      (r) => Prisma.sql`(${r.accountCid}, ${r.campaignId}, ${r.name}, ${r.status}, ${r.country}, now())`
    );
    await prisma.$executeRaw`
      INSERT INTO campaigns (account_cid, campaign_id, name, status, country, updated_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (account_cid, campaign_id)
      DO UPDATE SET
        name       = EXCLUDED.name,
        status     = EXCLUDED.status,
        country    = COALESCE(NULLIF(EXCLUDED.country, ''), campaigns.country),
        updated_at = now()
    `;
    total += batch.length;
  }
  return total;
}
