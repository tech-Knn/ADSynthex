import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getAccountCurrency } from '@/lib/currency-converter';
import { convertToUsd } from '@/lib/currency-service';

const LOW_ROI_THRESHOLD = 20;
const MIN_COST_FOR_ALERT = 5;
const WINDOW_DAYS = 7;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const cids = await getAccountsForUser(session.userId, session.role);
  if (cids.length === 0) return NextResponse.json({ notifications: [] });

  // Determine window end from latest data in scope (fallback: today).
  const latest = await prisma.$queryRaw<any[]>`
    SELECT MAX(date) AS d FROM ads_daily WHERE account_cid = ANY(${cids})
  `;
  const latestDate = latest[0]?.d ? new Date(latest[0].d) : new Date();
  const endIso = iso(latestDate);
  const startIso = iso(new Date(latestDate.getTime() - (WINDOW_DAYS - 1) * 86400000));

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      a.campaign_id,
      MAX(a.date) AS latest_date,
      c.name AS campaign_name,
      c.country,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      COALESCE(SUM(r.earnings), 0) AS revenue
    FROM ads_daily a
    LEFT JOIN campaigns c ON c.account_cid = a.account_cid AND c.campaign_id = a.campaign_id
    LEFT JOIN (
      SELECT channel_id, date, SUM(earnings) AS earnings
      FROM adsense_daily GROUP BY channel_id, date
    ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
    WHERE a.account_cid = ANY(${cids})
      AND a.date BETWEEN ${startIso}::date AND ${endIso}::date
    GROUP BY a.account_cid, a.campaign_id, c.name, c.country
  `;

  const rateByAccount = new Map<string, number>();
  for (const cid of cids) {
    const currency = getAccountCurrency(cid);
    rateByAccount.set(cid, currency === 'USD' ? 1 : await convertToUsd(1, currency));
  }

  // Account & owner lookup for admin
  const accountsMeta = await prisma.account.findMany({
    where: { cid: { in: cids } },
    select: { cid: true, seq: true },
  });
  const seqByCid = new Map(accountsMeta.map((a) => [a.cid, a.seq]));

  let ownerByCid = new Map<string, string>();
  if (session.role === 'admin') {
    const allocs = await prisma.allocation.findMany({
      where: { accountCid: { in: cids }, removedAt: null },
      select: { accountCid: true, user: { select: { username: true, email: true } } },
    });
    ownerByCid = new Map(
      allocs.map((a) => [a.accountCid, a.user.username || a.user.email.split('@')[0]]),
    );
  }

  const notifications = rows
    .map((row) => {
      const rate = rateByAccount.get(row.account_cid) ?? 1;
      const cost = (Number(row.cost) || 0) * rate;
      const revenue = Number(row.revenue) || 0;
      const profit = revenue - cost;
      const roi = cost > 0 ? (profit / cost) * 100 : 0;

      if (cost < MIN_COST_FOR_ALERT) return null;

      const losing = profit < 0;
      const lowRoi = !losing && roi < LOW_ROI_THRESHOLD;
      if (!losing && !lowRoi) return null;

      const seq = seqByCid.get(row.account_cid);
      const accountLabel = seq != null ? `aa-${String(seq).padStart(2, '0')}` : row.account_cid;
      const ownerName = ownerByCid.get(row.account_cid) || null;
      const campaignName = row.campaign_name || row.campaign_id;
      const latestDate = iso(new Date(row.latest_date));

      return {
        id: `${row.account_cid}:${row.campaign_id}`,
        level: losing ? ('danger' as const) : ('warn' as const),
        title: campaignName,
        accountLabel,
        ownerName,
        cost, revenue, profit, roi,
        latestDate,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 50);

  return NextResponse.json({ notifications });
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
