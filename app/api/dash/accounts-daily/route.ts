import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getAccountCurrency } from '@/lib/currency-converter';
import { convertToUsd } from '@/lib/currency-service';

type DayRow = {
  date: string;
  cost: number;
  revenue: number;
  profit: number;
  roi: number;
  conversions: number;
};

type AccountRow = {
  accountCid: string;
  campaigns: number;
  cost: number;
  revenue: number;
  profit: number;
  roi: number;
  conversions: number;
  daily: DayRow[];
};

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
  if (targets.length === 0) return NextResponse.json({ accounts: [] });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      a.date,
      COUNT(DISTINCT a.campaign_id) AS campaigns,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      SUM(a.conversions) AS conversions,
      COALESCE(SUM(r.earnings), 0) AS revenue
    FROM ads_daily a
    LEFT JOIN (
      SELECT channel_id, date, SUM(earnings) AS earnings
      FROM adsense_daily GROUP BY channel_id, date
    ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
    WHERE a.account_cid = ANY(${targets})
      AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY a.account_cid, a.date
    ORDER BY a.account_cid ASC, a.date ASC
  `;

  const rateByAccount = new Map<string, number>();
  for (const cid of targets) {
    const currency = getAccountCurrency(cid);
    rateByAccount.set(cid, currency === 'USD' ? 1 : await convertToUsd(1, currency));
  }

  // Campaign counts per account across the full range
  const campaignCounts = await prisma.$queryRaw<any[]>`
    SELECT account_cid, COUNT(DISTINCT campaign_id) AS campaigns
    FROM ads_daily
    WHERE account_cid = ANY(${targets})
      AND date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY account_cid
  `;
  const campaignsBy = new Map<string, number>(
    campaignCounts.map((r: any) => [r.account_cid as string, Number(r.campaigns) || 0]),
  );

  const perAccount = new Map<string, AccountRow>();
  for (const row of rows) {
    const cid = row.account_cid as string;
    const rate = rateByAccount.get(cid) ?? 1;
    const cost = (Number(row.cost) || 0) * rate;
    const revenue = Number(row.revenue) || 0;
    const profit = revenue - cost;
    const conversions = Number(row.conversions) || 0;
    const dayIso = iso(new Date(row.date));

    let entry = perAccount.get(cid);
    if (!entry) {
      entry = {
        accountCid: cid,
        campaigns: campaignsBy.get(cid) ?? 0,
        cost: 0,
        revenue: 0,
        profit: 0,
        roi: 0,
        conversions: 0,
        daily: [],
      };
      perAccount.set(cid, entry);
    }
    entry.cost += cost;
    entry.revenue += revenue;
    entry.profit += profit;
    entry.conversions += conversions;
    entry.daily.push({
      date: dayIso,
      cost,
      revenue,
      profit,
      roi: cost > 0 ? (profit / cost) * 100 : 0,
      conversions,
    });
  }

  for (const acc of perAccount.values()) {
    acc.roi = acc.cost > 0 ? (acc.profit / acc.cost) * 100 : 0;
  }

  const accounts = Array.from(perAccount.values()).sort((a, b) => b.revenue - a.revenue);
  return NextResponse.json({ accounts });
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
