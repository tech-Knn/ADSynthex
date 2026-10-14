import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getAccountCurrency } from '@/lib/currency-converter';
import { convertToUsd } from '@/lib/currency-service';

type DayRow = { date: string; cost: number; revenue: number; profit: number; roi: number };

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
  const allowed = await getAccountsForUser(effectiveUserId, effectiveRole);
  const targets = account && account !== 'all' ? allowed.filter((c) => c === account) : allowed;
  if (targets.length === 0) {
    return NextResponse.json({ summary: emptySummary(), byDay: [], delta: emptyDelta() });
  }

  const byDay = await fetchDaily(targets, startDate, endDate);

  // Previous period delta — same window length ending the day before startDate.
  const start = new Date(startDate);
  const end = new Date(endDate);
  const windowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (windowDays - 1) * 86400000);
  const prev = await fetchTotals(targets, iso(prevStart), iso(prevEnd));

  const totals = byDay.reduce(
    (acc, d) => {
      acc.cost += d.cost;
      acc.revenue += d.revenue;
      acc.profit += d.profit;
      return acc;
    },
    { cost: 0, revenue: 0, profit: 0 },
  );

  const summary = {
    cost: totals.cost,
    revenue: totals.revenue,
    profit: totals.profit,
    roi: totals.cost > 0 ? (totals.profit / totals.cost) * 100 : 0,
  };
  const delta = {
    cost: pctDelta(totals.cost, prev.cost),
    revenue: pctDelta(totals.revenue, prev.revenue),
    profit: pctDelta(totals.profit, prev.profit),
    roi: pctDelta(summary.roi, prev.cost > 0 ? ((prev.revenue - prev.cost) / prev.cost) * 100 : 0),
  };

  return NextResponse.json({ summary, byDay, delta });
}

async function fetchDaily(cids: string[], startDate: string, endDate: string): Promise<DayRow[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      a.date,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      COALESCE(SUM(r.earnings), 0) AS revenue
    FROM ads_daily a
    LEFT JOIN (
      SELECT channel_id, date, SUM(earnings) AS earnings
      FROM adsense_daily GROUP BY channel_id, date
    ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
    WHERE a.account_cid = ANY(${cids})
      AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY a.account_cid, a.date
    ORDER BY a.date ASC
  `;

  const rateByAccount = await buildRates(cids);
  const perDate = new Map<string, { cost: number; revenue: number }>();
  for (const row of rows) {
    const rate = rateByAccount.get(row.account_cid) ?? 1;
    const date = iso(new Date(row.date));
    const bucket = perDate.get(date) || { cost: 0, revenue: 0 };
    bucket.cost += (Number(row.cost) || 0) * rate;
    bucket.revenue += Number(row.revenue) || 0;
    perDate.set(date, bucket);
  }

  return Array.from(perDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      cost: v.cost,
      revenue: v.revenue,
      profit: v.revenue - v.cost,
      roi: v.cost > 0 ? ((v.revenue - v.cost) / v.cost) * 100 : 0,
    }));
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
