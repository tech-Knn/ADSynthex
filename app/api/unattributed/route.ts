import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';
import { fetchAdSenseDomainEarnings } from '@/lib/adsense-api';

/**
 * Minimal: Unattributed revenue for a feed's assigned domain only.
 *
 *   GET /api/unattributed?feed=androidadvice&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Default: today only, feed=androidadvice.
 * Response:
 *   { feed, domain, startDate, endDate, domainRevenue, attributed, unattributed }
 */

const FEED_ALLOWED_DOMAINS: Record<string, string[]> = {
  androidadvice: ['androidadvices.com'],
};

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const feedName = (searchParams.get('feed') || 'androidadvice').trim();
  const today = iso(new Date());
  const startDate = (searchParams.get('startDate') || today).trim();
  const endDate = (searchParams.get('endDate') || today).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'startDate/endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  const allowed = FEED_ALLOWED_DOMAINS[feedName];
  if (!allowed) {
    return NextResponse.json({ error: `no allowed-domains config for feed "${feedName}"` }, { status: 400 });
  }

  const feedRow = await prisma.feed.findUnique({ where: { feedName } });
  const legacyPub = feedName === 'androidadvice' ? process.env.ANDROIDADVICE_PUBLISHER_ID : undefined;
  const publisherId = feedRow?.publisherId || legacyPub;
  if (!publisherId) {
    return NextResponse.json({ error: `no publisher id configured for feed "${feedName}"` }, { status: 400 });
  }

  // 1. Live AdSense per-domain pull, sum allowed domains.
  let domainRevenue = 0;
  try {
    const perDomain = await fetchAdSenseDomainEarnings(publisherId, startDate, endDate, undefined, feedName as any);
    for (const [d, e] of Object.entries(perDomain)) {
      if (allowed.some((a) => d === a || d.endsWith('.' + a))) {
        domainRevenue += Number(e);
      }
    }
  } catch (err: any) {
    return NextResponse.json({ error: `AdSense fetch failed: ${err?.message || err}` }, { status: 502 });
  }

  // 2. Attributed revenue from DB — all active accounts in this feed.
  const feedAccounts = await prisma.account.findMany({
    where: { feedName, active: true },
    select: { cid: true },
  });
  const cids = feedAccounts.map((a) => a.cid);
  let attributed = 0;
  if (cids.length > 0) {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(r.earnings), 0) AS attributed
      FROM ads_daily a
      LEFT JOIN (
        SELECT channel_id, date, SUM(earnings) AS earnings
        FROM adsense_daily GROUP BY channel_id, date
      ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
      WHERE a.account_cid = ANY(${cids})
        AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    attributed = Number(rows[0]?.attributed) || 0;
  }

  return NextResponse.json({
    feed: feedName,
    domain: allowed.join(', '),
    startDate,
    endDate,
    domainRevenue: round2(domainRevenue),
    attributed: round2(attributed),
    unattributed: round2(Math.max(0, domainRevenue - attributed)),
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
