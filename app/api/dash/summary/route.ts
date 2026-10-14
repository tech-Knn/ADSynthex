import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getAccountCurrency } from '@/lib/currency-converter';
import { convertToUsd } from '@/lib/currency-service';

type DayRow = { date: string; cost: number; revenue: number; profit: number; roi: number; clicks: number };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const account = searchParams.get('account') || 'all';
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate required' }, { status: 400 });
  }

  const scopeUserId = searchParams.get('scopeUserId');
  const effectiveUserId = scopeUserId && session.role === 'admin' ? scopeUserId : session.userId;
  const effectiveRole = scopeUserId && session.role === 'admin' ? 'user' : session.role;
  // Only true admin views (no scopeUserId) see publisher-wide unattributed revenue.
  // Non-admins and per-user admin views do not.
  const showUnattributed = session.role === 'admin' && !scopeUserId;

  const allowed = await getAccountsForUser(effectiveUserId, effectiveRole);
  const targets = account && account !== 'all' ? allowed.filter((c) => c === account) : allowed;
  if (targets.length === 0) {
    return NextResponse.json({ summary: emptySummary(), byDay: [], delta: emptyDelta() });
  }

  const byDay = await fetchDaily(targets, startDate, endDate);
  const attributedClicks = await fetchAdsenseClicks(targets, startDate, endDate);
  const unatt = showUnattributed
    ? await fetchUnattributed(startDate, endDate)
    : { revenue: 0, clicks: 0 };
  const unattributedRevenue = unatt.revenue;
  const unattributedClicks = unatt.clicks;

  // Previous period delta — same window length ending the day before startDate.
  const start = new Date(startDate);
  const end = new Date(endDate);
  const windowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (windowDays - 1) * 86400000);
  const prev = await fetchTotals(targets, iso(prevStart), iso(prevEnd));
  const prevUnattributed = showUnattributed
    ? await fetchUnattributed(iso(prevStart), iso(prevEnd))
    : 0;

  const attributed = byDay.reduce(
    (acc, d) => {
      acc.cost += d.cost;
      acc.revenue += d.revenue;
      return acc;
    },
    { cost: 0, revenue: 0 },
  );

  // Admin dashboards include unattributed in Total Revenue (and therefore
  // Profit and ROI). Scoped / non-admin views keep attributed-only numbers.
  const totalRevenue = attributed.revenue + unattributedRevenue;
  const totalProfit = totalRevenue - attributed.cost;
  const totalRoi = attributed.cost > 0 ? (totalProfit / attributed.cost) * 100 : 0;

  const prevRevenueTotal = prev.revenue + prevUnattributed;
  const prevProfitTotal = prevRevenueTotal - prev.cost;
  const prevRoiTotal = prev.cost > 0 ? (prevProfitTotal / prev.cost) * 100 : 0;

  const totalClicks = attributedClicks + unattributedClicks;
  const summary: Record<string, number> = {
    cost: attributed.cost,
    revenue: totalRevenue,
    profit: totalProfit,
    roi: totalRoi,
    adsenseClicks: totalClicks,
  };
  if (showUnattributed) summary.unattributedRevenue = unattributedRevenue;

  const delta = {
    cost: pctDelta(attributed.cost, prev.cost),
    revenue: pctDelta(totalRevenue, prevRevenueTotal),
    profit: pctDelta(totalProfit, prevProfitTotal),
    roi: pctDelta(totalRoi, prevRoiTotal),
  };

  return NextResponse.json({ summary, byDay, delta });
}

async function fetchDaily(cids: string[], startDate: string, endDate: string): Promise<DayRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      a.date,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      COALESCE(SUM(r.earnings), 0) AS revenue,
      COALESCE(SUM(r.clicks), 0) AS clicks
    FROM ads_daily a
    LEFT JOIN (
      SELECT channel_id, date, SUM(earnings) AS earnings, SUM(clicks) AS clicks
      FROM adsense_daily GROUP BY channel_id, date
    ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
    WHERE a.account_cid = ANY(${cids})
      AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY a.account_cid, a.date
    ORDER BY a.date ASC
  `;

  const rateByAccount = await buildRates(cids);
  const perDate = new Map<string, { cost: number; revenue: number; clicks: number }>();
  for (const row of rows) {
    const rate = rateByAccount.get(row.account_cid) ?? 1;
    const date = iso(new Date(row.date));
    const bucket = perDate.get(date) || { cost: 0, revenue: 0, clicks: 0 };
    bucket.cost += (Number(row.cost) || 0) * rate;
    bucket.revenue += Number(row.revenue) || 0;
    bucket.clicks += Number(row.clicks) || 0;
    perDate.set(date, bucket);
  }

  return Array.from(perDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      cost: v.cost,
      revenue: v.revenue,
      clicks: v.clicks,
      profit: v.revenue - v.cost,
      roi: v.cost > 0 ? ((v.revenue - v.cost) / v.cost) * 100 : 0,
    }));
}

async function fetchAdsenseClicks(cids: string[], startDate: string, endDate: string): Promise<number> {
  // Attributed AdSense clicks: scoped to channels that have an ads_daily row
  // for one of the user's allowed accounts in the date range.
  const rows = await prisma.$queryRaw<any[]>`
    WITH ads_channels AS (
      SELECT DISTINCT channel_id, date
      FROM ads_daily
      WHERE account_cid = ANY(${cids})
        AND date BETWEEN ${startDate}::date AND ${endDate}::date
        AND channel_id != ''
    )
    SELECT COALESCE(SUM(ad.clicks), 0) AS clicks
    FROM adsense_daily ad
    JOIN ads_channels ac ON ac.channel_id = ad.channel_id AND ac.date = ad.date
    WHERE ad.date BETWEEN ${startDate}::date AND ${endDate}::date
  `;
  return Number(rows[0]?.clicks) || 0;
}

async function fetchUnattributed(startDate: string, endDate: string): Promise<{ revenue: number; clicks: number }> {
  const rows = await prisma.$queryRaw<any[]>`
    WITH ads_channels AS (
      SELECT DISTINCT channel_id, date
      FROM ads_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
        AND channel_id != ''
    ),
    adsense_total AS (
      SELECT channel_id, date, SUM(earnings) AS earnings, SUM(clicks) AS clicks
      FROM adsense_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY channel_id, date
    )
    SELECT
      COALESCE(SUM(at.earnings), 0) AS revenue,
      COALESCE(SUM(at.clicks), 0) AS clicks
    FROM adsense_total at
    LEFT JOIN ads_channels ac ON ac.channel_id = at.channel_id AND ac.date = at.date
    WHERE ac.channel_id IS NULL
  `;
  return {
    revenue: Number(rows[0]?.revenue) || 0,
    clicks: Number(rows[0]?.clicks) || 0,
  };
}

async function fetchTotals(cids: string[], startDate: string, endDate: string) {
  if (cids.length === 0) return { cost: 0, revenue: 0, profit: 0 };
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      COALESCE(SUM(r.earnings), 0) AS revenue
    FROM ads_daily a
    LEFT JOIN (
      SELECT channel_id, date, SUM(earnings) AS earnings
      FROM adsense_daily GROUP BY channel_id, date
    ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
    WHERE a.account_cid = ANY(${cids})
      AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY a.account_cid
  `;
  const rateByAccount = await buildRates(cids);
  const totals = { cost: 0, revenue: 0, profit: 0 };
  for (const row of rows) {
    const rate = rateByAccount.get(row.account_cid) ?? 1;
    totals.cost += (Number(row.cost) || 0) * rate;
    totals.revenue += Number(row.revenue) || 0;
  }
  totals.profit = totals.revenue - totals.cost;
  return totals;
}

async function buildRates(cids: string[]) {
  const rateByAccount = new Map<string, number>();
  for (const cid of cids) {
    const currency = getAccountCurrency(cid);
    rateByAccount.set(cid, currency === 'USD' ? 1 : await convertToUsd(1, currency));
  }
  return rateByAccount;
}

function pctDelta(curr: number, prev: number): number | null {
  if (!isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptySummary() {
  return { cost: 0, revenue: 0, profit: 0, roi: 0 };
}
function emptyDelta() {
  return { cost: null, revenue: null, profit: null, roi: null };
}
