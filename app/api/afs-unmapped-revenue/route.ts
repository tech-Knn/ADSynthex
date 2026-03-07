import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAdSenseRevenueByStyleId,
  extractStyleIdFromUrl,
  extractDomainFromUrl
} from '@/lib/adsense-api';
import { cookies } from 'next/headers';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { ACCOUNT_FEED_ACCESS, hasAccessToFeed } from '@/lib/account-access-control';

interface UnmappedRevenueEntry {
  style_id: string;
  domain: string;
  country_name: string;
  date: string;
  revenue: number;
  clicks: number;
  impressions: number;
  reason: 'no_cost_data' | 'style_id_not_in_account' | 'domain_mismatch';
}

const normalizeDomain = (domain: string): string => {
  if (!domain) return domain;
  return domain.replace(/^(search\.|www\.|m\.)/, '');
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { startDate, endDate, adsenseAccountId, customerId, accountIds } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 });
    }

    if (!adsenseAccountId) {
      return NextResponse.json({ error: 'Missing adsenseAccountId' }, { status: 400 });
    }

    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;
    const userAccountId = cookieStore.get('account_id')?.value;

    const requestedAccountIds: string[] = [];
    if (customerId) {
      requestedAccountIds.push(customerId);
    }
    if (accountIds && accountIds.length > 0) {
      requestedAccountIds.push(...accountIds);
    }

    for (const accId of requestedAccountIds) {
      const normalizedAccId = accId.startsWith('CID_') ? accId : `CID_${accId}`;

      if (!ACCOUNT_FEED_ACCESS[normalizedAccId]) {
        return NextResponse.json({
          error: 'Invalid account ID',
          message: `Account ${accId} is not configured`
        }, { status: 403 });
      }

      if (!hasAccessToFeed(normalizedAccId, 'adsense')) {
        return NextResponse.json({
          error: 'Access denied',
          message: `Account ${accId} does not have AFS access`
        }, { status: 403 });
      }
    }

    // For regular users, enforce they can only access their own account
    if (authType === 'user' && userAccountId) {
      const normalizedUserAccountId = userAccountId.startsWith('CID_') ? userAccountId : `CID_${userAccountId}`;
      const accountValue = normalizedUserAccountId.replace('CID_', '');

      if (customerId && customerId !== accountValue) {
        return NextResponse.json({ error: 'Access denied to this account' }, { status: 403 });
      }

      if (accountIds && accountIds.length > 0) {
        const hasUnauthorized = accountIds.some((id: string) => id !== accountValue);
        if (hasUnauthorized) {
          return NextResponse.json({ error: 'Access denied to requested accounts' }, { status: 403 });
        }
      }
    }

    console.log('[AFS_UNMAPPED_REVENUE] Fetching data from APIs...');

    // Determine if we're viewing multiple accounts
    const isMultiAccount = accountIds && accountIds.length > 0;

    // Fetch Google Ads data
    let googleAdsDataPromises;
    if (isMultiAccount) {
      googleAdsDataPromises = Promise.all(
        accountIds.map((accId: string) =>
          bulletproofAPI.getData(startDate, endDate, accId, {
            priority: 8,
            allowStale: true,
            maxWait: 30000,
            feedType: 'adsense'
          })
        )
      );
    } else if (customerId) {
      googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
        priority: 8,
        allowStale: true,
        maxWait: 30000,
        feedType: 'adsense'
      }).then(result => [result]);
    } else {
      throw new Error('No Google Ads account specified');
    }

    const [googleAdsResults, adsenseRevenueData] = await Promise.all([
      googleAdsDataPromises,
      fetchAdSenseRevenueByStyleId(adsenseAccountId, startDate, endDate, customerId)
    ]);

    console.log('[AFS_UNMAPPED_REVENUE] Data fetched successfully');

    // Process Google Ads data
    let googleAdsData: any = { campaigns: [], ads: [] };

    if (isMultiAccount) {
      for (let i = 0; i < googleAdsResults.length; i++) {
        const accountResult = googleAdsResults[i];
        const accountId = accountIds[i];
        const accData = accountResult.data;

        if (accData?.campaigns) {
          accData.campaigns.forEach((c: any) => c.account_id = accountId);
          googleAdsData.campaigns.push(...accData.campaigns);
        }
        if (accData?.ads) {
          accData.ads.forEach((a: any) => a.account_id = accountId);
          googleAdsData.ads.push(...accData.ads);
        }
      }
    } else {
      const singleResult = googleAdsResults[0];
      googleAdsData = singleResult.data || { campaigns: [], ads: [] };
    }

    console.log(`[AFS_UNMAPPED_REVENUE] Google Ads: ${googleAdsData.campaigns?.length || 0} campaigns, ${googleAdsData.ads?.length || 0} ads`);
    console.log(`[AFS_UNMAPPED_REVENUE] AdSense: ${adsenseRevenueData.length} revenue records`);

    // Build campaign to style_id + domain mapping
    const campaignToStyleMap = new Map<string, { styleIds: Set<string>; domains: Set<string> }>();

    for (const ad of googleAdsData.ads || []) {
      const campaignId = String(ad.campaign_id);
      const finalUrls = ad.final_urls || [];

      if (!campaignToStyleMap.has(campaignId)) {
        campaignToStyleMap.set(campaignId, {
          styleIds: new Set<string>(),
          domains: new Set<string>()
        });
      }

      const mapping = campaignToStyleMap.get(campaignId)!;

      for (const url of finalUrls) {
        const styleId = extractStyleIdFromUrl(url);
        let domain = extractDomainFromUrl(url);
        if (domain) domain = normalizeDomain(domain);
        if (styleId) mapping.styleIds.add(styleId);
        if (domain) mapping.domains.add(domain);
      }
    }

    // Build style_id + domain combinations from campaigns
    const styleDomainCombinations = new Set<string>();
    const currentAccountStyleIds = new Set<string>();

    for (const [_campaignId, data] of campaignToStyleMap.entries()) {
      for (const styleId of data.styleIds) {
        currentAccountStyleIds.add(styleId);
        for (const domain of data.domains) {
          const key = `${styleId}_${domain}`;
          styleDomainCombinations.add(key);
        }
      }
    }

    console.log(`[AFS_UNMAPPED_REVENUE] Mapped style_ids in campaigns: ${currentAccountStyleIds.size}`);
    console.log(`[AFS_UNMAPPED_REVENUE] Mapped style+domain combinations: ${styleDomainCombinations.size}`);

    // Build cost lookup from campaigns (to check if cost data exists)
    const costByStyleDomain = new Map<string, { cost: number }>();

    for (const campaign of googleAdsData.campaigns || []) {
      const campaignId = String(campaign.campaign_id);
      const urlData = campaignToStyleMap.get(campaignId);

      if (!urlData || urlData.styleIds.size === 0) continue;

      const cost = campaign.metrics?.cost || 0;

      if (cost > 0) {
        for (const styleId of urlData.styleIds) {
          for (const domain of urlData.domains) {
            const key = `${styleId}_${domain}`;
            if (!costByStyleDomain.has(key)) {
              costByStyleDomain.set(key, { cost: 0 });
            }
            const existing = costByStyleDomain.get(key)!;
            existing.cost += cost;
          }
        }
      }
    }

    console.log(`[AFS_UNMAPPED_REVENUE] Cost data found for ${costByStyleDomain.size} style+domain combinations`);

    // Find unmapped revenue
    const unmappedRevenue: UnmappedRevenueEntry[] = [];
    let totalUnmappedRevenue = 0;
    let totalUnmappedClicks = 0;
    let totalUnmappedImpressions = 0;

    for (const rev of adsenseRevenueData) {
      const normalizedDomain = rev.domain_name ? normalizeDomain(rev.domain_name) : 'N/A';
      const key = `${rev.style_id}_${normalizedDomain}`;

      // Check if this revenue is mapped
      const hasStyleId = currentAccountStyleIds.has(rev.style_id);
      const hasCost = costByStyleDomain.has(key);
      const isInCombinations = styleDomainCombinations.has(key);

      // Determine reason for being unmapped
      let reason: 'no_cost_data' | 'style_id_not_in_account' | 'domain_mismatch';

      if (!hasStyleId) {
        reason = 'style_id_not_in_account';
      } else if (!isInCombinations) {
        reason = 'domain_mismatch';
      } else if (!hasCost) {
        reason = 'no_cost_data';
      } else {
        // This revenue IS mapped, skip it
        continue;
      }

      // Add to unmapped list
      unmappedRevenue.push({
        style_id: rev.style_id,
        domain: normalizedDomain,
        country_name: rev.country_name || 'N/A',
        date: rev.date,
        revenue: rev.earnings,
        clicks: rev.clicks,
        impressions: rev.impressions,
        reason
      });

      totalUnmappedRevenue += rev.earnings;
      totalUnmappedClicks += rev.clicks;
      totalUnmappedImpressions += rev.impressions;
    }

    // Aggregate by style_id + domain
    const aggregatedUnmapped = new Map<string, {
      style_id: string;
      domain: string;
      countries: Set<string>;
      dates: Set<string>;
      total_revenue: number;
      total_clicks: number;
      total_impressions: number;
      reason: string;
      sample_records: UnmappedRevenueEntry[];
    }>();

    for (const entry of unmappedRevenue) {
      const key = `${entry.style_id}_${entry.domain}`;

      if (!aggregatedUnmapped.has(key)) {
        aggregatedUnmapped.set(key, {
          style_id: entry.style_id,
          domain: entry.domain,
          countries: new Set(),
          dates: new Set(),
          total_revenue: 0,
          total_clicks: 0,
          total_impressions: 0,
          reason: entry.reason,
          sample_records: []
        });
      }

      const agg = aggregatedUnmapped.get(key)!;
      agg.countries.add(entry.country_name);
      agg.dates.add(entry.date);
      agg.total_revenue += entry.revenue;
      agg.total_clicks += entry.clicks;
      agg.total_impressions += entry.impressions;

      // Keep first 3 sample records
      if (agg.sample_records.length < 3) {
        agg.sample_records.push(entry);
      }
    }

    // Convert to array
    const aggregatedUnmappedArray = Array.from(aggregatedUnmapped.values())
      .map(item => ({
        style_id: item.style_id,
        domain: item.domain,
        countries: Array.from(item.countries),
        date_range: {
          start: Array.from(item.dates).sort()[0],
          end: Array.from(item.dates).sort().pop() || '',
          unique_dates: item.dates.size
        },
        total_revenue: item.total_revenue,
        total_clicks: item.total_clicks,
        total_impressions: item.total_impressions,
        reason: item.reason,
        sample_records: item.sample_records
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue);

    // Group by reason
    const reasonBreakdown = {
      no_cost_data: {
        count: 0,
        revenue: 0
      },
      style_id_not_in_account: {
        count: 0,
        revenue: 0
      },
      domain_mismatch: {
        count: 0,
        revenue: 0
      }
    };

    for (const entry of unmappedRevenue) {
      reasonBreakdown[entry.reason].count++;
      reasonBreakdown[entry.reason].revenue += entry.revenue;
    }

    const totalDuration = Date.now() - startTime;

    console.log(`[AFS_UNMAPPED_REVENUE] ===== SUMMARY =====`);
    console.log(`[AFS_UNMAPPED_REVENUE] Total unmapped records: ${unmappedRevenue.length}`);
    console.log(`[AFS_UNMAPPED_REVENUE] Total unmapped revenue: $${totalUnmappedRevenue.toFixed(2)}`);
    console.log(`[AFS_UNMAPPED_REVENUE] Aggregated combinations: ${aggregatedUnmappedArray.length}`);
    console.log(`[AFS_UNMAPPED_REVENUE] Completed in ${totalDuration}ms`);

    const response = {
      success: true,
      account: adsenseAccountId,
      dateRange: { startDate, endDate },
      summary: {
        total_unmapped_records: unmappedRevenue.length,
        total_unmapped_revenue: totalUnmappedRevenue,
        total_unmapped_clicks: totalUnmappedClicks,
        total_unmapped_impressions: totalUnmappedImpressions,
        aggregated_combinations: aggregatedUnmappedArray.length,
        reason_breakdown: reasonBreakdown
      },
      unmapped_revenue: {
        detailed: unmappedRevenue,
        aggregated: aggregatedUnmappedArray
      },
      context: {
        total_revenue_records: adsenseRevenueData.length,
        mapped_style_ids: currentAccountStyleIds.size,
        mapped_combinations: styleDomainCombinations.size,
        campaigns_with_cost: costByStyleDomain.size
      },
      _timestamp: new Date().toISOString(),
      _duration_ms: totalDuration
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('[AFS_UNMAPPED_REVENUE] Error:', error);

    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      _duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    message: 'AFS Unmapped Revenue API - Returns AdSense revenue that is NOT mapped to any Google Ads campaign',
    endpoint: '/api/afs-unmapped-revenue',
    method: 'POST',
    requiredFields: ['startDate', 'endDate', 'adsenseAccountId', 'customerId or accountIds'],
    description: 'Identifies orphaned revenue with no cost attribution',
    timestamp: new Date().toISOString()
  });
}
