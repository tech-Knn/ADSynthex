import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAdSenseRevenueByStyleId,
  extractStyleIdFromUrl,
  extractDomainFromUrl,
  type AdSenseRevenue
} from '@/lib/adsense-api';
import { cookies } from 'next/headers';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { getDashboardFromMongoDB } from '@/lib/db/dashboard-helper';

interface RevenueByStyleId {
  style_id: string;
  domain: string;
  country_name: string;
  date: string;
  earnings: number;
  clicks: number;
  impressions: number;
}

interface Summary {
  totalEarnings: number;
  totalClicks: number;
  totalImpressions: number;
  uniqueStyleIds: number;
  uniqueDomains: number;
  uniqueCountries: number;
  recordCount: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { startDate, endDate, adsenseAccountId, customerId, accountIds } = body;

    console.log('[ADSENSE_REVENUE] ===== REQUEST START =====');
    console.log('[ADSENSE_REVENUE] Date range:', startDate, 'to', endDate);
    console.log('[ADSENSE_REVENUE] AdSense Account:', adsenseAccountId);
    console.log('[ADSENSE_REVENUE] Customer ID:', customerId);
    console.log('[ADSENSE_REVENUE] Account IDs:', accountIds);

    if (!startDate || !endDate) {
      console.error('[ADSENSE_REVENUE] Missing date range');
      return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 });
    }

    if (!adsenseAccountId) {
      console.error('[ADSENSE_REVENUE] Missing adsenseAccountId');
      return NextResponse.json({ error: 'Missing adsenseAccountId' }, { status: 400 });
    }

    // Optional auth check for user accounts
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;
    const userAccountId = cookieStore.get('account_id')?.value;

    if (authType === 'user' && userAccountId) {

      console.log('[ADSENSE_REVENUE] User access:', userAccountId);

      const normalizedUserAccountId = userAccountId.startsWith('CID_') ? userAccountId : `CID_${userAccountId}`;
      const accountValue = normalizedUserAccountId.replace('CID_', '');

      if (customerId && customerId !== accountValue) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      if (accountIds && accountIds.length > 0) {
        const hasUnauthorized = accountIds.some((id: string) => id !== accountValue);
        if (hasUnauthorized) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
    }

    // ==================== MONGODB FIRST: Check for fresh data ====================
    console.log('[ADSENSE_REVENUE] 🔍 Checking MongoDB for fresh data...');

    const accountToQuery = accountIds && accountIds.length > 0
      ? accountIds
      : (customerId || 'all');

    const mongoData = await getDashboardFromMongoDB(
      'afs',
      accountToQuery,
      startDate,
      endDate,
      240 // 4 hours freshness (increased from 30min to reduce API quota usage)
    );

    if (mongoData) {
      console.log(`[ADSENSE_REVENUE] ✅ Returning fresh MongoDB data (${mongoData.age} min old)`);
      console.log(`[ADSENSE_REVENUE] MongoDB data includes ${mongoData.data.campaign_aggregated?.length || 0} campaigns`);
      return NextResponse.json({
        cost_revenue_mapping: mongoData.data.cost_revenue_mapping,
        campaign_aggregated: mongoData.data.campaign_aggregated || [],
        summary: mongoData.data.summary,
        _source: 'mongodb',
        _timestamp: new Date().toISOString(),
        _message: `Fresh data from MongoDB (${mongoData.age} minutes old)`,
        _dataFreshness: {
          source: 'mongodb',
          ageMinutes: mongoData.age,
          isFresh: true,
          message: `Data is ${mongoData.age} minutes old`
        }
      });
    }

    console.log('[ADSENSE_REVENUE] ⚠️  MongoDB data stale/missing, fetching from API...');

    const fetchStartTime = Date.now();

    // Determine if we're viewing a single account or multiple
    const isMultiAccount = accountIds && accountIds.length > 0;
    const isSingleAccountView = !isMultiAccount;

    // CRITICAL: When viewing a single account, we need to fetch ALL AFS accounts' data
    // to calculate proportional revenue allocation (since style_ids are shared)
    let allAfsAccountIds: string[] = [];

    if (isSingleAccountView) {
      // Import account access control to get all AFS account IDs
      const { ACCOUNT_FEED_ACCESS } = await import('@/lib/account-access-control');

      // Get all account IDs that have AFS access
      allAfsAccountIds = Object.keys(ACCOUNT_FEED_ACCESS)
        .filter(key => {
          const feeds = ACCOUNT_FEED_ACCESS[key];
          return feeds && feeds.includes('adsense');
        })
        .map(key => key.replace('CID_', ''));

      console.log(`[ADSENSE_COST_REVENUE] Single account view - fetching ALL ${allAfsAccountIds.length} AFS accounts for proportional allocation`);
    }

    // Fetch Google Ads data
    let googleAdsDataPromises;
    let allAccountsDataPromises;

    if (isMultiAccount) {
      console.log('[ADSENSE_COST_REVENUE] Fetching multiple accounts:', accountIds);
      googleAdsDataPromises = Promise.all(
        accountIds.map((accId: string) =>
          bulletproofAPI.getData(startDate, endDate, accId, {
            priority: 8,
            allowStale: true,
            maxWait: 10000,
            feedType: 'adsense'
          })
        )
      );
    } else if (customerId) {
      console.log('[ADSENSE_COST_REVENUE] Fetching single account:', customerId);
      googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
        priority: 8,
        allowStale: true,
        maxWait: 10000,
        feedType: 'adsense'
      });

      // Also fetch ALL AFS accounts for proportional allocation
      allAccountsDataPromises = Promise.all(
        allAfsAccountIds.map((accId: string) =>
          bulletproofAPI.getData(startDate, endDate, accId, {
            priority: 6,
            allowStale: true,
            maxWait: 10000,
            feedType: 'adsense'
          })
        )
      );
    } else {
      throw new Error('No Google Ads account specified');
    }

    const promisesToSettle = [
      googleAdsDataPromises,
      fetchAdSenseRevenueByStyleId(adsenseAccountId, startDate, endDate)
    ];

    // Add all accounts data promise for single account view
    if (isSingleAccountView && allAccountsDataPromises) {
      promisesToSettle.push(allAccountsDataPromises);
    }

    const results = await Promise.allSettled(promisesToSettle);
    const googleAdsResult = results[0];
    const adsenseRevenue = results[1];
    const allAccountsResult = isSingleAccountView && results.length > 2 ? results[2] : null;

    const fetchTime = Date.now() - fetchStartTime;

    // Handle Google Ads data
    let googleAdsData: any;
    let message = '';

    if (googleAdsResult.status === 'rejected') {
      console.error('[ADSENSE_COST_REVENUE] Google Ads API failed:', googleAdsResult.reason);
      message += 'Google Ads: Failed. ';
      googleAdsData = { campaigns: [] };
    } else {
      if (isMultiAccount) {
        const accountsData = googleAdsResult.value as any[];
        googleAdsData = { campaigns: [], ads: [] };
        accountsData.forEach((accountResult: any, index: number) => {
          const accData = accountResult.data;
          if (accData?.campaigns) {
            accData.campaigns.forEach((c: any) => c.account_id = accountIds[index]);
            googleAdsData.campaigns.push(...accData.campaigns);
          }
          if (accData?.ads) {
            accData.ads.forEach((a: any) => a.account_id = accountIds[index]);
            googleAdsData.ads.push(...accData.ads);
          }
        });
        message += `Google Ads: ${accountsData.length} accounts, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads. `;
      } else {
        const singleResult = googleAdsResult.value as any;
        googleAdsData = singleResult.data;
        message += `Google Ads: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads. `;
      }
    }

    // Handle AdSense data
    let adsenseData: AdSenseRevenue[] = [];
    if (adsenseRevenue.status === 'fulfilled') {
      adsenseData = adsenseRevenue.value as AdSenseRevenue[];
      message += `AdSense: ${adsenseData.length} records. `;
    } else {
      console.error('[ADSENSE_COST_REVENUE] AdSense API failed:', adsenseRevenue.reason);
      message += 'AdSense: Failed. ';
    }

    console.log(`[ADSENSE_COST_REVENUE] Fetch completed in ${fetchTime}ms - ${message}`);

    // Build revenue lookup map: key = date_styleId_country_domain
    const revenueLookup = new Map<string, AdSenseRevenue>();
    for (const rev of adsenseData) {
      const fullKey = `${rev.date}_${rev.style_id}_${rev.country_name || 'ALL'}_${rev.domain_name || 'ALL'}`;
      const domainKey = `${rev.date}_${rev.style_id}_ALL_${rev.domain_name || 'ALL'}`;
      const styleKey = `${rev.date}_${rev.style_id}_ALL_ALL`;

      revenueLookup.set(fullKey, rev);
      if (!revenueLookup.has(domainKey)) revenueLookup.set(domainKey, rev);
      if (!revenueLookup.has(styleKey)) revenueLookup.set(styleKey, rev);
    }

    console.log(`[ADSENSE_COST_REVENUE] Built revenue lookup with ${revenueLookup.size} keys`);

    // Debug: Show sample revenue data
    const sampleRevenues = adsenseData.slice(0, 3);
    if (sampleRevenues.length > 0) {
      console.log('[ADSENSE_COST_REVENUE] Sample AdSense revenue:');
      sampleRevenues.forEach((rev, idx) => {
        console.log(`  ${idx + 1}. Date=${rev.date}, Style=${rev.style_id}, Domain=${rev.domain_name}, Country=${rev.country_name}, Earnings=$${rev.earnings}`);
      });
    }

    // Helper function to normalize domain (remove subdomain like "search.")
    const normalizeDomain = (domain: string): string => {
      if (!domain) return domain;
      // Remove common subdomains like "search.", "www.", "m."
      return domain.replace(/^(search\.|www\.|m\.)/, '');
    };

    // Build campaign to ads mapping (URLs are in ads, not campaigns)
    const campaignToStyleMap = new Map<string, { styleIds: Set<string>; domains: Set<string>; campaignName: string }>();

    // Extract style_id and domain from ads
    for (const ad of googleAdsData.ads || []) {
      const campaignId = String(ad.campaign_id);
      const finalUrls = ad.final_urls || [];

      if (!campaignToStyleMap.has(campaignId)) {
        // Get campaign name from campaigns data
        const campaign = (googleAdsData.campaigns || []).find((c: any) => String(c.campaign_id) === campaignId);
        const campaignName = campaign?.campaign_name || campaign?.name || `Campaign ${campaignId}`;

        campaignToStyleMap.set(campaignId, {
          styleIds: new Set<string>(),
          domains: new Set<string>(),
          campaignName: campaignName
        });
      }

      const mapping = campaignToStyleMap.get(campaignId)!;

      for (const url of finalUrls) {
        const styleId = extractStyleIdFromUrl(url);
        let domain = extractDomainFromUrl(url);
        if (domain) domain = normalizeDomain(domain); // Normalize domain
        if (styleId) mapping.styleIds.add(styleId);
        if (domain) mapping.domains.add(domain);
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Extracted style_ids from ${campaignToStyleMap.size} campaigns with ads`);

    // Debug: Show sample style_id extractions (now with normalized domains)
    let debugCount = 0;
    for (const [campaignId, data] of campaignToStyleMap.entries()) {
      if (debugCount < 3 && data.styleIds.size > 0) {
        console.log(`[ADSENSE_COST_REVENUE] Campaign ${campaignId}: styles=[${Array.from(data.styleIds).join(',')}], normalized_domains=[${Array.from(data.domains).join(',')}]`);
        debugCount++;
      }
    }

    // Build style_id+domain to campaign name mapping
    const styleDomainToCampaignName = new Map<string, string>();

    // For single account view, we need campaign names from ALL AFS accounts (not just selected account)
    // because style_ids are shared across accounts
    if (isSingleAccountView && allAccountsResult && allAccountsResult.status === 'fulfilled') {
      console.log('[ADSENSE_COST_REVENUE] Building campaign name mapping from ALL AFS accounts for single account view');

      const allAccountsData = allAccountsResult.value as any[];

      // Process each account's data to extract campaign names
      for (let i = 0; i < allAccountsData.length; i++) {
        const accountResult = allAccountsData[i];
        const accountData = accountResult.data;

        if (!accountData || !accountData.campaigns || !accountData.ads) {
          continue;
        }

        // Build campaign to style map for this account
        const accountCampaignToStyleMap = new Map<string, { styleIds: Set<string>; domains: Set<string>; campaignName: string }>();

        for (const ad of accountData.ads || []) {
          const campaignId = String(ad.campaign_id);
          const finalUrls = ad.final_urls || [];

          if (!accountCampaignToStyleMap.has(campaignId)) {
            const campaign = (accountData.campaigns || []).find((c: any) => String(c.campaign_id) === campaignId);
            const campaignName = campaign?.campaign_name || campaign?.name || `Campaign ${campaignId}`;

            accountCampaignToStyleMap.set(campaignId, {
              styleIds: new Set<string>(),
              domains: new Set<string>(),
              campaignName: campaignName
            });
          }

          const mapping = accountCampaignToStyleMap.get(campaignId)!;

          for (const url of finalUrls) {
            const styleId = extractStyleIdFromUrl(url);
            let domain = extractDomainFromUrl(url);
            if (domain) domain = normalizeDomain(domain);
            if (styleId) mapping.styleIds.add(styleId);
            if (domain) mapping.domains.add(domain);
          }
        }

        // Add campaign names to global mapping
        for (const [_campaignId, data] of accountCampaignToStyleMap.entries()) {
          for (const styleId of data.styleIds) {
            for (const domain of data.domains) {
              const key = `${styleId}_${domain}`;
              if (!styleDomainToCampaignName.has(key)) {
                styleDomainToCampaignName.set(key, data.campaignName);
              }
            }
          }
        }
      }
    } else {
      // For multi-account view or if all accounts data not available, use current account's data
      for (const [_campaignId, data] of campaignToStyleMap.entries()) {
        for (const styleId of data.styleIds) {
          for (const domain of data.domains) {
            const key = `${styleId}_${domain}`;
            // If multiple campaigns use the same style_id+domain, keep the first one
            if (!styleDomainToCampaignName.has(key)) {
              styleDomainToCampaignName.set(key, data.campaignName);
            }
          }
        }
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Built style_id+domain to campaign name mapping for ${styleDomainToCampaignName.size} combinations`);

    // Build cost lookup by style_id + domain from campaigns
    const costByStyleDomain = new Map<string, { cost: number; clicks: number; impressions: number }>();

    for (const campaign of googleAdsData.campaigns || []) {
      const campaignId = String(campaign.campaign_id);
      const urlData = campaignToStyleMap.get(campaignId);

      if (!urlData || urlData.styleIds.size === 0) continue;

      const cost = campaign.metrics?.cost || 0;
      const clicks = campaign.metrics?.clicks || 0;
      const impressions = campaign.metrics?.impressions || 0;

      // Add cost for each style_id + domain combination
      for (const styleId of urlData.styleIds) {
        for (const domain of urlData.domains) {
          const key = `${styleId}_${domain}`;
          if (!costByStyleDomain.has(key)) {
            costByStyleDomain.set(key, { cost: 0, clicks: 0, impressions: 0 });
          }
          const existing = costByStyleDomain.get(key)!;
          existing.cost += cost;
          existing.clicks += clicks;
          existing.impressions += impressions;
        }
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Built cost lookup for ${costByStyleDomain.size} style_id/domain combinations`);

    // Helper function to extract article from URL
    const extractArticleFromUrl = (url: string): string => {
      if (!url) return 'N/A';
      try {
        // Remove query params and trailing slash
        const cleanUrl = url.split('?')[0].replace(/\/$/, '');
        const urlParts = cleanUrl.split('/');
        // Get the last part of the URL path
        const lastPart = urlParts[urlParts.length - 1];
        // Remove file extensions
        const article = lastPart.replace(/\.(html?|php|aspx?)$/, '');
        return article || 'N/A';
      } catch (err) {
        return 'N/A';
      }
    };
    
    // Build a Set of style_ids that belong to the selected account
    const accountStyleIds = new Set<string>();
    for (const [_campaignId, data] of campaignToStyleMap.entries()) {
      for (const styleId of data.styleIds) {
        accountStyleIds.add(styleId);
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Account has ${accountStyleIds.size} unique style_ids from campaigns`);

    // Calculate the TOTAL cost for each style_id+domain across ALL AFS accounts
    // This helps us determine each account's share of the revenue
    const totalCostByStyleDomain = new Map<string, number>();

    if (isSingleAccountView && allAccountsResult && allAccountsResult.status === 'fulfilled') {
      console.log('[ADSENSE_COST_REVENUE] Building total cost map from ALL AFS accounts');

      const allAccountsData = allAccountsResult.value as any[];

      // Process each account's data
      for (let i = 0; i < allAccountsData.length; i++) {
        const accountResult = allAccountsData[i];
        const accountData = accountResult.data;
        const accountId = allAfsAccountIds[i];

        if (!accountData || !accountData.campaigns || !accountData.ads) {
          console.log(`[ADSENSE_COST_REVENUE] Skipping account ${accountId} - no data`);
          continue;
        }

        // Build campaign to style map for this account
        const accountCampaignToStyleMap = new Map<string, { styleIds: Set<string>; domains: Set<string> }>();

        for (const ad of accountData.ads || []) {
          const campaignId = String(ad.campaign_id);
          const finalUrls = ad.final_urls || [];

          if (!accountCampaignToStyleMap.has(campaignId)) {
            accountCampaignToStyleMap.set(campaignId, {
              styleIds: new Set<string>(),
              domains: new Set<string>()
            });
          }

          const mapping = accountCampaignToStyleMap.get(campaignId)!;

          for (const url of finalUrls) {
            const styleId = extractStyleIdFromUrl(url);
            let domain = extractDomainFromUrl(url);
            if (domain) domain = normalizeDomain(domain);
            if (styleId) mapping.styleIds.add(styleId);
            if (domain) mapping.domains.add(domain);
          }
        }

        // Add this account's cost to the total cost map
        for (const campaign of accountData.campaigns || []) {
          const campaignId = String(campaign.campaign_id);
          const urlData = accountCampaignToStyleMap.get(campaignId);

          if (!urlData || urlData.styleIds.size === 0) continue;

          const cost = campaign.metrics?.cost || 0;

          for (const styleId of urlData.styleIds) {
            for (const domain of urlData.domains) {
              const key = `${styleId}_${domain}`;
              const currentTotal = totalCostByStyleDomain.get(key) || 0;
              totalCostByStyleDomain.set(key, currentTotal + cost);
            }
          }
        }
      }

      console.log(`[ADSENSE_COST_REVENUE] Total cost map built from all accounts: ${totalCostByStyleDomain.size} entries`);
    } else {
      // For multi-account view, total cost = account cost
      for (const [key, costData] of costByStyleDomain.entries()) {
        totalCostByStyleDomain.set(key, costData.cost);
      }
      console.log(`[ADSENSE_COST_REVENUE] Multi-account view - using account cost as total: ${totalCostByStyleDomain.size} entries`);
    }

    // Build revenue map with proportional allocation
    const revenueByStyleDomain = new Map<string, any>();

    for (const rev of adsenseData) {
      const normalizedDomain = rev.domain_name ? normalizeDomain(rev.domain_name) : 'N/A';
      const key = `${rev.style_id}_${normalizedDomain}`;

      // For single account view, only process style_ids that belong to this account
      if (isSingleAccountView && !accountStyleIds.has(rev.style_id)) {
        continue;
      }

      if (!revenueByStyleDomain.has(key)) {
        // Get the campaign name from our mapping
        const campaignName = styleDomainToCampaignName.get(key) || `Style ${rev.style_id}`;

        revenueByStyleDomain.set(key, {
          campaign_id: rev.style_id,
          campaign_name: campaignName,
          style_id: rev.style_id,
          domain: normalizedDomain,
          article: 'N/A',
          cost: 0,
          revenue: 0,
          profit: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          costClicks: 0,
          cpa: 0,
          conversionRate: 0,
          rpc: 0,
          roi: 0,
          roas: 0
        });
      }

      const existing = revenueByStyleDomain.get(key)!;

      // When viewing a single account, we need to allocate revenue proportionally
      // based on this account's cost share (since multiple accounts may use same style_id)
      if (isSingleAccountView && costByStyleDomain.has(key)) {
        const accountCost = costByStyleDomain.get(key)!.cost;
        const totalCost = totalCostByStyleDomain.get(key) || accountCost;

        // Allocate revenue proportionally based on cost share
        // If this account spent 30% of total cost for this style_id, give it 30% of revenue
        const costShare = totalCost > 0 ? accountCost / totalCost : 1;
        existing.revenue += rev.earnings * costShare;
        existing.clicks += Math.round(rev.clicks * costShare);
        existing.conversions += Math.round(rev.clicks * costShare);

        if (costShare < 1) {
          console.log(`[ADSENSE_COST_REVENUE] Proportional allocation for ${key}: cost_share=${(costShare * 100).toFixed(1)}%, revenue=$${(rev.earnings * costShare).toFixed(2)} of $${rev.earnings.toFixed(2)}`);
        }
      } else {
        // For "all accounts" view, use full revenue
        existing.revenue += rev.earnings;
        existing.clicks += rev.clicks;
        existing.conversions += rev.clicks;
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] After filtering, processing revenue for ${revenueByStyleDomain.size} style_id/domain combinations`);

    // Extract article information from Google Ads campaign URLs
    console.log(`[ADSENSE_COST_REVENUE] Extracting article names from campaign URLs...`);
    for (const ad of googleAdsData.ads || []) {
      const finalUrls = ad.final_urls || [];

      for (const url of finalUrls) {
        const styleId = extractStyleIdFromUrl(url);
        let domain = extractDomainFromUrl(url);
        if (domain) domain = normalizeDomain(domain);
        const article = extractArticleFromUrl(url);

        if (styleId && domain) {
          const key = `${styleId}_${domain}`;
          const existing = revenueByStyleDomain.get(key);
          if (existing && article !== 'N/A') {
            // Set article if not already set or if this is a better match
            if (existing.article === 'N/A') {
              existing.article = article;
              console.log(`[ADSENSE_COST_REVENUE] Set article for ${key}: ${article}`);
            }
          }
        }
      }
    }

    // Add cost data where available
    let matchedCost = 0;
    let unmatchedCost = 0;

    for (const [key, costData] of costByStyleDomain.entries()) {
      if (revenueByStyleDomain.has(key)) {
        const existing = revenueByStyleDomain.get(key)!;
        existing.cost = costData.cost;
        existing.costClicks = costData.clicks; // Google Ads clicks
        existing.impressions = costData.impressions;
        existing.profit = existing.revenue - existing.cost;
        existing.roi = existing.cost > 0 ? (existing.profit / existing.cost) * 100 : 0;
        existing.roas = existing.cost > 0 ? existing.revenue / existing.cost : 0;

        // Calculate CPA (Cost Per Acquisition) - cost per AdSense click
        existing.cpa = existing.conversions > 0 ? existing.cost / existing.conversions : 0;

        // Calculate Conversion Rate - (AdSense clicks / Google Ads clicks) * 100
        existing.conversionRate = existing.costClicks > 0 ? (existing.conversions / existing.costClicks) * 100 : 0;

        // Calculate RPC (Revenue Per Click) - revenue per AdSense click
        existing.rpc = existing.clicks > 0 ? existing.revenue / existing.clicks : 0;

        matchedCost++;
      } else {
        // Cost exists but no revenue - create entry
        const parts = key.split('_');
        const styleId = parts[0];
        const domain = parts.slice(1).join('_'); // Handle domains with underscores

        // Get the campaign name from our mapping
        const campaignName = styleDomainToCampaignName.get(key) || `Style ${styleId}`;

        revenueByStyleDomain.set(key, {
          campaign_id: styleId,
          campaign_name: campaignName,
          style_id: styleId,
          domain: domain,
          article: 'N/A',
          cost: costData.cost,
          revenue: 0,
          profit: -costData.cost,
          clicks: 0,
          costClicks: costData.clicks,
          impressions: costData.impressions,
          conversions: 0,
          cpa: 0,
          conversionRate: 0,
          rpc: 0,
          roi: -100,
          roas: 0
        });
        unmatchedCost++;
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Cost mapping: ${matchedCost} matched with revenue, ${unmatchedCost} without revenue`);

    // Calculate metrics for entries with only revenue (no cost)
    for (const [, data] of revenueByStyleDomain.entries()) {
      if (data.cost === 0 && data.revenue > 0) {
        data.profit = data.revenue;
        // If there's revenue but no cost, RPC can still be calculated
        data.rpc = data.clicks > 0 ? data.revenue / data.clicks : 0;
      }
    }

    const campaign_aggregated = Array.from(revenueByStyleDomain.values())
      .sort((a, b) => b.revenue - a.revenue);

    console.log(`[ADSENSE_COST_REVENUE] Created ${campaign_aggregated.length} style_id/domain entries (revenue + cost mapped)`);

    // Calculate totals
    const totalCost = campaign_aggregated.reduce((sum, c) => sum + c.cost, 0);
    const totalRevenue = campaign_aggregated.reduce((sum, c) => sum + c.revenue, 0);
    const totalProfit = totalRevenue - totalCost;
    const totalClicks = campaign_aggregated.reduce((sum, c) => sum + c.clicks, 0);
    const totalImpressions = campaign_aggregated.reduce((sum, c) => sum + c.impressions, 0);
    const totalConversions = campaign_aggregated.reduce((sum, c) => sum + c.conversions, 0);

    const uniqueStyleIds = new Set(adsenseData.map(r => r.style_id));
    const uniqueDomains = new Set(adsenseData.map(r => r.domain_name).filter(Boolean));
    const uniqueCountries = new Set(adsenseData.map(r => r.country_name).filter(Boolean));

    const response = {
      success: true,
      account: adsenseAccountId,
      dateRange: { startDate, endDate },
      google_ads_data: { campaigns: googleAdsData.campaigns || [], total: (googleAdsData.campaigns || []).length },
      adsense_data: { revenues: adsenseData, total: adsenseData.length },
      campaign_aggregated,
      summary: {
        totalCost,
        totalRevenue,
        totalProfit,
        totalClicks,
        totalImpressions,
        totalConversions,
        overallROI: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
        overallROAS: totalCost > 0 ? totalRevenue / totalCost : 0,
        profitableCampaigns: campaign_aggregated.filter(c => c.profit > 0).length,
        totalCampaigns: campaign_aggregated.length,
        profitabilityRate: campaign_aggregated.length > 0 ? (campaign_aggregated.filter(c => c.profit > 0).length / campaign_aggregated.length) * 100 : 0,
        uniqueStyleIds: uniqueStyleIds.size,
        uniqueDomains: uniqueDomains.size,
        uniqueCountries: uniqueCountries.size
      },
      _source: 'adsense_cost_revenue_mapped',
      _timestamp: new Date().toISOString(),
      _fetchTime: `${fetchTime}ms`,
      _loadTime: `${Date.now() - startTime}ms`,
      _message: message.trim()
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });

  } catch (error) {
    console.error('[ADSENSE_REVENUE] Error:', error);

    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      _loadTime: `${Date.now() - startTime}ms`
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    message: 'AdSense Cost/Revenue Mapping API - Maps Google Ads cost with AdSense revenue by style_id, domain, and country',
    endpoint: '/api/adsense-cost-revenue',
    method: 'POST',
    requiredFields: ['startDate', 'endDate', 'adsenseAccountId', 'customerId or accountIds'],
    timestamp: new Date().toISOString()
  });
}
