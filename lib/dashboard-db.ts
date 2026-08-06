import { prisma } from './prisma';
import { fetchAdSenseDomainEarnings } from './adsense-api';
import { getAccountsForUser } from './account-scope';

/**
 * Dashboard data — Postgres se.
 * Wahi shape jo /api/adsense-cost-revenue deta hai, par live API ke bajaye DB se.
 */
export async function dashboardFromDb(params: {
  startDate: string;
  endDate: string;
  accountIds?: string[];
  userId: string;
  role: string;
}) {
  const t0 = Date.now();
  const { startDate, endDate, userId, role } = params;

  // Accounts this caller is allowed to see (admin = all active, user = allotted only)
  const allowed = await getAccountsForUser(userId, role);

  // If specific accountIds were requested, intersect them with what's allowed —
  // a user can never widen their scope by passing extra IDs.
  let targets = params.accountIds?.length
    ? params.accountIds.filter((id) => allowed.includes(id))
    : allowed;
    console.log('[DASH_DEBUG] role:', role, 'userId:', userId, 'allowed:', allowed.length, 'targets:', targets.length);

  // cost (ads_daily) + revenue (adsense_daily, countries pehle SUM karke)
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      a.account_cid,
      a.campaign_id,
      a.channel_id,
      COALESCE(c.name, '')    AS campaign_name,
      COALESCE(c.country, '') AS country,
      SUM(a.cost_micros) / 1000000.0 AS cost,
      SUM(a.clicks)                  AS cost_clicks,
      SUM(a.impressions)             AS impressions,
      SUM(a.conversions)             AS conversions,
      COALESCE(r.revenue, 0)         AS revenue,
      COALESCE(r.rev_clicks, 0)      AS revenue_clicks
    FROM ads_daily a
    LEFT JOIN campaigns c
      ON c.account_cid = a.account_cid AND c.campaign_id = a.campaign_id
    LEFT JOIN (
      SELECT channel_id,
             SUM(earnings) AS revenue,
             SUM(clicks)   AS rev_clicks
      FROM adsense_daily
      WHERE date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY channel_id
    ) r ON r.channel_id = a.channel_id AND a.channel_id != ''
    WHERE a.account_cid = ANY(${targets})
      AND a.date BETWEEN ${startDate}::date AND ${endDate}::date
    GROUP BY a.account_cid, a.campaign_id, a.channel_id, c.name, c.country, r.revenue, r.rev_clicks
    ORDER BY revenue DESC
  `;

  const campaign_aggregated = rows.map((row) => {
    const cost = Number(row.cost) || 0;
    const revenue = Number(row.revenue) || 0;
    const profit = revenue - cost;
    const clicks = Number(row.revenue_clicks) || 0;
    const conversions = Number(row.conversions) || 0;
    return {
      account_id: row.account_cid,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name || `Style ${row.channel_id}`,
      style_id: row.channel_id,
      domain: 'N/A',
      country: row.country || '',
      article: 'N/A',
      cost, revenue, profit, clicks,
      impressions: Number(row.impressions) || 0,
      conversions,
      costClicks: Number(row.cost_clicks) || 0,
      cpa: conversions > 0 ? cost / conversions : 0,
      rpc: clicks > 0 ? revenue / clicks : 0,
      roi: cost > 0 ? (profit / cost) * 100 : 0,
      roas: cost > 0 ? revenue / cost : 0,
    };
  });

  // account-level rollup
  const byAccount = new Map<string, any>();
  for (const c of campaign_aggregated) {
    const id = c.account_id || 'unknown';
    if (!byAccount.has(id)) {
      byAccount.set(id, {
        account_id: id, cost: 0, revenue: 0, profit: 0,
        clicks: 0, impressions: 0, conversions: 0, campaignCount: 0,
      });
    }
    const a = byAccount.get(id);
    a.cost += c.cost; a.revenue += c.revenue; a.profit += c.profit;
    a.clicks += c.clicks; a.impressions += c.impressions;
    a.conversions += c.conversions; a.campaignCount++;
  }

  const account_level_aggregated = Array.from(byAccount.values())
    .map((a) => ({
      ...a,
      roi: a.cost > 0 ? (a.profit / a.cost) * 100 : 0,
      roas: a.cost > 0 ? a.revenue / a.cost : 0,
      cpa: a.conversions > 0 ? a.cost / a.conversions : 0,
      rpc: a.clicks > 0 ? a.revenue / a.clicks : 0,
    }))
    .sort((x, y) => y.revenue - x.revenue);

  // Domain-wise revenue live AdSense se (ek hi call, poore publisher ka).
  // DB me nahi rakhte kyunki AdSense channel_id + domain ek saath nahi deta,
  // aur ye call sasti hai.
  const FEED_DOMAIN = 'androidadvices.com';
  let feedDomainTotal = 0;
  let otherSites: { domain: string; earnings: number }[] = [];

  try {
    const feed = await prisma.feed.findUnique({ where: { feedName: 'androidadvice' } });
    const publisherId = feed?.publisherId || process.env.ANDROIDADVICE_PUBLISHER_ID;

    if (publisherId) {
      const domainTotals = await fetchAdSenseDomainEarnings(
        publisherId, startDate, endDate, undefined, 'androidadvice' as any
      );

      for (const [domain, earnings] of Object.entries(domainTotals)) {
        const amount = Number(earnings) || 0;
        if (domain === FEED_DOMAIN) {
          feedDomainTotal = amount;
        } else if (amount > 0) {
          otherSites.push({ domain, earnings: amount });
        }
      }
      otherSites.sort((a, b) => b.earnings - a.earnings);
    }
  } catch (err) {
    console.warn('[DASHBOARD_DB] Domain earnings fetch failed:', err);
    // fail ho to bhi baaki dashboard chalta rahe
  }

  const otherSitesTotal = otherSites.reduce((s, d) => s + d.earnings, 0);

  const totalCost = campaign_aggregated.reduce((s, c) => s + c.cost, 0);
  const totalRevenue = campaign_aggregated.reduce((s, c) => s + c.revenue, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalClicks = campaign_aggregated.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = campaign_aggregated.reduce((s, c) => s + c.impressions, 0);
  const totalConversions = campaign_aggregated.reduce((s, c) => s + c.conversions, 0);

  const state = await prisma.syncState.findUnique({ where: { feedName: 'androidadvice' } });

  return {
    success: true,
    dateRange: { startDate, endDate },
    google_ads_data: { campaigns: [], total: 0 },
    adsense_data: { revenues: [], total: 0 },
    campaign_aggregated,
    account_level_aggregated,
    unattributed_revenue: {
      total: Math.max(0, feedDomainTotal - totalRevenue),
      clicks: 0,
      styleIdCount: 0,
      items: [],
    },
    other_sites: {
      total: otherSitesTotal,
      sites: otherSites,
    },
    data_quality: {
      partial: false,
      total_accounts_requested: targets.length,
      failed_account_ids: [],
      partial_cost_account_ids: [],
    },
    summary: {
      totalCost, totalRevenue, totalProfit,
      totalClicks, totalImpressions, totalConversions,
      overallROI: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
      overallROAS: totalCost > 0 ? totalRevenue / totalCost : 0,
      profitableCampaigns: campaign_aggregated.filter((c) => c.profit > 0).length,
      totalCampaigns: campaign_aggregated.length,
      totalAccounts: account_level_aggregated.length,
      profitableAccounts: account_level_aggregated.filter((a) => a.profit > 0).length,
    },
    _source: 'postgres',
    _lastSyncedDate: state?.lastSyncedDate ?? null,
    _lastRunAt: state?.lastRunAt ?? null,
    _loadTime: `${Date.now() - t0}ms`,
  };
}

/**
 * Is date range me DB me data hai ya nahi.
 * Route isse decide karta hai: DB se do, ya live se do + background sync.
 */
export async function hasDbData(
  startDate: string,
  endDate: string,
  accountIds?: string[]
): Promise<boolean> {
  const where: any = {
    date: { gte: new Date(startDate), lte: new Date(endDate) },
  };
  if (accountIds?.length) where.accountCid = { in: accountIds };

  const count = await prisma.adsDaily.count({ where, take: 1 });
  return count > 0;
}
