import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';
import { fetchAdSenseDomainEarnings } from '@/lib/adsense-api';

/**
 * Per-domain AdSense earnings breakdown (live from AdSense API) for a feed's
 * publisher, plus what we've attributed to campaigns in the DB. Used to
 * diagnose unattributed revenue mix — e.g. "is the Unattributed Rev card
 * actually including queryvaults.com, amitbhawani.com, etc.?"
 *
 *   GET /api/diagnostics/adsense-domains?feed=androidadvice&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Defaults: today only.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const feed = (searchParams.get('feed') || 'androidadvice').trim();
  const todayIso = iso(new Date());
  const startDate = (searchParams.get('startDate') || todayIso).trim();
  const endDate = (searchParams.get('endDate') || todayIso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'startDate/endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  const feedRow = await prisma.feed.findUnique({ where: { feedName: feed } });
  if (!feedRow) {
    return NextResponse.json({ error: `unknown feed "${feed}"` }, { status: 404 });
  }
  const legacyPubId = feed === 'androidadvice' ? process.env.ANDROIDADVICE_PUBLISHER_ID : undefined;
  const publisherId = feedRow.publisherId || legacyPubId;
  if (!publisherId) {
    return NextResponse.json({ error: `publisher id missing for feed "${feed}"` }, { status: 400 });
  }

  // Live AdSense pull — per-domain earnings for this publisher.
  let perDomain: Record<string, number> = {};
  try {
    perDomain = await fetchAdSenseDomainEarnings(
      publisherId, startDate, endDate, undefined, feed as any,
    );
  } catch (err: any) {
    return NextResponse.json({
      feed, publisherId, startDate, endDate,
      error: err?.message || String(err),
    }, { status: 500 });
  }

  const total = Object.values(perDomain).reduce((s, v) => s + v, 0);
  const assigned = feed === 'androidadvice' ? 'androidadvices.com' : null;
  const assignedTotal = assigned ? (perDomain[assigned] || 0) : 0;
  const otherDomainsTotal = total - assignedTotal;

  // Attributed revenue from DB (ads_daily ↔ adsense_daily join, scoped to this feed's accounts).
  const feedAccounts = await prisma.account.findMany({
    where: { feedName: feed, active: true },
    select: { cid: true },
  });
  const cids = feedAccounts.map((a) => a.cid);
  let attributedDb = 0;
  if (cids.length > 0) {
    const row = await prisma.$queryRaw<any[]>`
      SELECT COALESCE(SUM(r.earnings), 0) AS attributed
      FROM ads_daily a
      LEFT JOIN (
        SELECT channel_id, date, SUM(earnings) AS earnings
        FROM adsense_daily GROUP BY channel_id, date
      ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
      WHERE a.account_cid = ANY(${cids})
        AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    attributedDb = Number(row[0]?.attributed) || 0;
  }

  // Current /api/dash/summary logic for unattributed = adsense_daily rows with no matching ads_daily row,
  // publisher-wide (NOT scoped to domain).
  const currentUnattribRow = await prisma.$queryRaw<any[]>`
    WITH ads_channels AS (
      SELECT DISTINCT channel_id, date FROM ads_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date AND channel_id != ''
    ),
    adsense_total AS (
      SELECT channel_id, date, SUM(earnings) AS earnings
      FROM adsense_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY channel_id, date
    )
    SELECT COALESCE(SUM(at.earnings), 0) AS unattributed
    FROM adsense_total at
    LEFT JOIN ads_channels ac ON ac.channel_id = at.channel_id AND ac.date = at.date
    WHERE ac.channel_id IS NULL
  `;
  const currentUnattributedGlobal = Number(currentUnattribRow[0]?.unattributed) || 0;

  // The "right" unattributed for this feed = assignedDomainTotal - attributedDb
  const correctUnattributedForFeed = assigned ? Math.max(0, assignedTotal - attributedDb) : null;

  return NextResponse.json({
    feed,
    publisherId,
    assignedDomain: assigned,
    dateRange: { startDate, endDate },
    adsenseLive: {
      perDomain,
      total,
      assignedDomainTotal: assignedTotal,
      otherDomainsTotal,
      otherDomains: Object.entries(perDomain)
        .filter(([d]) => d !== assigned)
        .map(([domain, earnings]) => ({ domain, earnings })),
    },
    db: {
      attributedForFeedAccounts: attributedDb,
      currentUnattributedGlobalFromDashboard: currentUnattributedGlobal,
    },
    verdict: {
      correctUnattributedForFeed,
      currentlyShownOnDashboard: currentUnattributedGlobal,
      overcountedBy: currentUnattributedGlobal - (correctUnattributedForFeed ?? 0),
      note: assigned
        ? `Dashboard "Unattributed Rev" should be about $${correctUnattributedForFeed?.toFixed(2) ?? '?'} (= ${assigned} total $${assignedTotal.toFixed(2)} - attributed $${attributedDb.toFixed(2)}). It is currently showing $${currentUnattributedGlobal.toFixed(2)}, which includes $${otherDomainsTotal.toFixed(2)} from unrelated domains.`
        : 'Feed has no assigned domain configured.',
    },
  });
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
