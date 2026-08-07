import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function GET(
    req: NextRequest,
    { params }: { params: { userId: string } },
) {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const accountFilter = searchParams.get('account');

    const allocs = await prisma.allocation.findMany({
        where: { userId: params.userId, removedAt: null },
        select: { accountCid: true },
    });
    let cids = allocs.map(a => a.accountCid);
    if (accountFilter && accountFilter !== 'all') {
        cids = cids.filter(c => c === accountFilter);
    }
    if (cids.length === 0) return NextResponse.json({ rows: [] });

    const rows = startDate && endDate
        ? await prisma.$queryRaw<any[]>`
        SELECT
          a.account_cid,
          COUNT(DISTINCT a.campaign_id)  AS campaigns,
          SUM(a.cost_micros) / 1000000.0 AS cost,
          SUM(a.conversions)             AS conversions,
          COALESCE(SUM(r.earnings), 0)   AS revenue
        FROM ads_daily a
        LEFT JOIN (
          SELECT channel_id, date, SUM(earnings) AS earnings
          FROM adsense_daily GROUP BY channel_id, date
        ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
        WHERE a.account_cid = ANY(${cids})
          AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
        GROUP BY a.account_cid
        ORDER BY revenue DESC
      `
        : await prisma.$queryRaw<any[]>`
        SELECT
          a.account_cid,
          COUNT(DISTINCT a.campaign_id)  AS campaigns,
          SUM(a.cost_micros) / 1000000.0 AS cost,
          SUM(a.conversions)             AS conversions,
          COALESCE(SUM(r.earnings), 0)   AS revenue
        FROM ads_daily a
        LEFT JOIN (
          SELECT channel_id, date, SUM(earnings) AS earnings
          FROM adsense_daily GROUP BY channel_id, date
        ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
        WHERE a.account_cid = ANY(${cids})
        GROUP BY a.account_cid
        ORDER BY revenue DESC
      `;

    const result = rows.map(r => {
        const cost = Number(r.cost) || 0;
        const revenue = Number(r.revenue) || 0;
        const profit = revenue - cost;
        return {
            accountCid: r.account_cid,
            campaigns: Number(r.campaigns) || 0,
            cost, revenue, profit,
            conversions: Number(r.conversions) || 0,
            roi: cost > 0 ? (profit / cost) * 100 : 0,
        };
    });

    const campaignRows = startDate && endDate
        ? await prisma.$queryRaw<any[]>`
        SELECT
          a.campaign_id,
          c.name AS campaign_name,
          c.country,
          SUM(a.cost_micros) / 1000000.0 AS cost,
          SUM(a.conversions) AS conversions,
          SUM(a.clicks) AS clicks,
          COALESCE(SUM(r.earnings), 0) AS revenue
        FROM ads_daily a
        LEFT JOIN campaigns c ON c.campaign_id = a.campaign_id
        LEFT JOIN (
          SELECT channel_id, date, SUM(earnings) AS earnings
          FROM adsense_daily GROUP BY channel_id, date
        ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
        WHERE a.account_cid = ANY(${cids})
          AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
        GROUP BY a.campaign_id, c.name, c.country
        ORDER BY cost DESC
      `
        : await prisma.$queryRaw<any[]>`
        SELECT
          a.campaign_id,
          c.name AS campaign_name,
          c.country,
          SUM(a.cost_micros) / 1000000.0 AS cost,
          SUM(a.conversions) AS conversions,
          SUM(a.clicks) AS clicks,
          COALESCE(SUM(r.earnings), 0) AS revenue
        FROM ads_daily a
        LEFT JOIN campaigns c ON c.campaign_id = a.campaign_id
        LEFT JOIN (
          SELECT channel_id, date, SUM(earnings) AS earnings
          FROM adsense_daily GROUP BY channel_id, date
        ) r ON r.channel_id = a.channel_id AND r.date = a.date AND a.channel_id != ''
        WHERE a.account_cid = ANY(${cids})
        GROUP BY a.campaign_id, c.name, c.country
        ORDER BY cost DESC
      `;

    const campaigns = campaignRows.map(c => {
        const cost = Number(c.cost) || 0;
        const revenue = Number(c.revenue) || 0;
        const conversions = Number(c.conversions) || 0;
        const clicks = Number(c.clicks) || 0;
        const profit = revenue - cost;
        return {
            campaignId: c.campaign_id,
            campaignName: c.campaign_name || c.campaign_id,
            styleId: c.campaign_id,
            country: c.country || '—',
            cost, revenue, profit, conversions, clicks,
            cpa: conversions > 0 ? cost / conversions : 0,
            rpc: clicks > 0 ? revenue / clicks : 0,
            roi: cost > 0 ? (profit / cost) * 100 : 0,
        };
    });

    return NextResponse.json({ rows: result, campaigns });
}