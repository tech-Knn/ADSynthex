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
  clicks: number;
  conversions: number;
};

type CampaignRow = {
  campaignId: string;
  campaignName: string;
  styleId: string;
  country: string;
  accountCid: string;
  cost: number;
  revenue: number;
  profit: number;
  roi: number;
  clicks: number;
  conversions: number;
  cpa: number;
  rpc: number;
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
  if (targets.length === 0) return NextResponse.json({ campaigns: [] });

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      a.campaign_id,
      a.date,
      c.name AS campaign_name,
      c.country,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      SUM(a.clicks) AS clicks,
      SUM(a.conversions) AS conversions,
      COALESCE(SUM(r.earnings), 0) AS revenue
    FROM ads_daily a
    LEFT JOIN campaigns c ON c.account_cid = a.account_cid AND c.campaign_id = a.campaign_id
    LEFT JOIN (
      SELECT channel_id, date, SUM(earnings) AS earnings
      FROM adsense_daily GROUP BY channel_id, date
    ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
    WHERE a.account_cid = ANY(${targets})
      AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY a.account_cid, a.campaign_id, a.date, c.name, c.country
    ORDER BY a.campaign_id ASC, a.date ASC
  `;

  const rateByAccount = new Map<string, number>();
  for (const cid of targets) {
    const currency = getAccountCurrency(cid);
    rateByAccount.set(cid, currency === 'USD' ? 1 : await convertToUsd(1, currency));
  }

  const perCampaign = new Map<string, CampaignRow>();
  for (const row of rows) {
    const key = `${row.account_cid}::${row.campaign_id}`;
    const rate = rateByAccount.get(row.account_cid) ?? 1;
    const cost = (Number(row.cost) || 0) * rate;
    const revenue = Number(row.revenue) || 0;
    const profit = revenue - cost;
    const clicks = Number(row.clicks) || 0;
    const conversions = Number(row.conversions) || 0;
    const dayIso = iso(new Date(row.date));

    let entry = perCampaign.get(key);
    if (!entry) {
      entry = {
        campaignId: row.campaign_id,
        campaignName: row.campaign_name || row.campaign_id,
        styleId: row.campaign_id,
        country: row.country || '—',
        accountCid: row.account_cid,
        cost: 0, revenue: 0, profit: 0, roi: 0,
        clicks: 0, conversions: 0, cpa: 0, rpc: 0,
        daily: [],
      };
      perCampaign.set(key, entry);
    }
    entry.cost += cost;
    entry.revenue += revenue;
    entry.profit += profit;
    entry.clicks += clicks;
    entry.conversions += conversions;
    entry.daily.push({
      date: dayIso,
      cost, revenue, profit,
      roi: cost > 0 ? (profit / cost) * 100 : 0,
      clicks, conversions,
    });
  }

  for (const c of perCampaign.values()) {
    c.roi = c.cost > 0 ? (c.profit / c.cost) * 100 : 0;
    c.cpa = c.conversions > 0 ? c.cost / c.conversions : 0;
    c.rpc = c.clicks > 0 ? c.revenue / c.clicks : 0;
  }

  const campaigns = Array.from(perCampaign.values()).sort((a, b) => b.cost - a.cost);
  return NextResponse.json({ campaigns });
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
