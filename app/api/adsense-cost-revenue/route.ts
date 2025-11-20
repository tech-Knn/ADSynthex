import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAdSenseRevenueByStyleId,
  extractStyleIdFromUrl,
  extractDomainFromUrl,
  type AdSenseRevenue
} from '@/lib/adsense-api';
import { cookies } from 'next/headers';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { redisCacheManager } from '@/lib/redis-cache-manager';

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
    const { startDate, endDate, adsenseAccountId, customerId, accountIds, forceLive } = body;

    console.log('[ADSENSE_REVENUE] ===== REQUEST START =====');
    console.log('[ADSENSE_REVENUE] Date range:', startDate, 'to', endDate);
    console.log('[ADSENSE_REVENUE] AdSense Account:', adsenseAccountId);
    console.log('[ADSENSE_REVENUE] Customer ID:', customerId);
    console.log('[ADSENSE_REVENUE] Account IDs:', accountIds);
    console.log('[ADSENSE_REVENUE] Force Live:', forceLive || false);

    // CRITICAL: Create cache key for cost+revenue mapping (ensures they're cached together)
    const cacheKey = `adsense_cost_revenue:${adsenseAccountId}:${startDate}:${endDate}:${customerId || accountIds?.join('_') || 'all'}`;
    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds

    // Check if we have cached cost+revenue mapping
    if (!forceLive) {
      try {
        const cached = await redisCacheManager.get(cacheKey, {
          dataType: 'unified',
          forceRefresh: false
        });

        if (cached.data && !cached.isStale && cached.age < CACHE_TTL) {
          console.log(`[ADSENSE_COST_REVENUE] ✅ Cache HIT! Age: ${Math.round(cached.age / 1000)}s (valid for ${Math.round((CACHE_TTL - cached.age) / 1000)}s more)`);

          return NextResponse.json({
            ...cached.data,
            _cached: true,
            _cacheAge: `${Math.round(cached.age / 1000)}s`,
            _cacheExpiresIn: `${Math.round((CACHE_TTL - cached.age) / 1000)}s`
          }, {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        } else if (cached.data) {
          console.log(`[ADSENSE_COST_REVENUE] Cache STALE (age: ${Math.round(cached.age / 1000)}s > ${CACHE_TTL / 1000}s), fetching fresh...`);
        } else {
          console.log(`[ADSENSE_COST_REVENUE] Cache MISS, fetching fresh...`);
        }
      } catch (err) {
        console.warn('[ADSENSE_COST_REVENUE] Cache check failed:', err);
      }
    }

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

    // ==================== FETCH FROM APIS ====================
    console.log('[ADSENSE_REVENUE] ⚡ Fetching data directly from APIs...');

    // Check if querying "today's" data for smarter caching
    const today = new Date().toISOString().split('T')[0];
    const isToday = startDate === today || endDate === today;
    const isOnlyToday = startDate === today && endDate === today;

    console.log(`[ADSENSE_REVENUE] Date analysis: isToday=${isToday}, isOnlyToday=${isOnlyToday}`);

    const fetchStartTime = Date.now();

    // Determine if we're viewing a single account or multiple
    const isMultiAccount = accountIds && accountIds.length > 0;

    // Fetch Google Ads data
    let googleAdsDataPromises;

    if (isMultiAccount) {
      console.log('[ADSENSE_COST_REVENUE] Fetching multiple accounts:', accountIds.length, 'accounts');

      // CRITICAL FIX: Batch requests to prevent overwhelming API and rate limits
      // Process 3 accounts at a time instead of all 21 simultaneously
      // This prevents timeouts and ensures consistent data
      const BATCH_SIZE = 3;
      const batches: string[][] = [];
      for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
        batches.push(accountIds.slice(i, i + BATCH_SIZE));
      }

      console.log(`[ADSENSE_COST_REVENUE] Processing ${batches.length} batches of max ${BATCH_SIZE} accounts each`);

      // Process batches sequentially, but accounts within each batch in parallel
      const allResults: any[] = [];
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`[ADSENSE_COST_REVENUE] Batch ${i + 1}/${batches.length}: Fetching ${batch.length} accounts: ${batch.join(', ')}`);

        const batchResults = await Promise.all(
          batch.map((accId: string) =>
            bulletproofAPI.getData(startDate, endDate, accId, {
              priority: isToday ? 9 : 8,
              allowStale: true, // Allow stale for reliability (full response is cached separately)
              maxWait: 30000, // Increased to 30s for better reliability
              feedType: 'adsense'
            })
          )
        );

        allResults.push(...batchResults);
        console.log(`[ADSENSE_COST_REVENUE] Batch ${i + 1}/${batches.length}: Completed, ${batchResults.filter(r => r.data).length}/${batch.length} succeeded`);

        // Delay between batches to prevent rate limit spikes (1 second)
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      googleAdsDataPromises = Promise.resolve(allResults);
    } else if (customerId) {
      console.log('[ADSENSE_COST_REVENUE] Fetching single account:', customerId);
      googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
        priority: isToday ? 9 : 8,
        allowStale: true, // Allow stale for reliability (full response is cached separately)
        maxWait: 30000,
        feedType: 'adsense'
      });
    } else {
      throw new Error('No Google Ads account specified');
    }

    const promisesToSettle = [
      googleAdsDataPromises,
      fetchAdSenseRevenueByStyleId(adsenseAccountId, startDate, endDate)
    ];

    const results = await Promise.allSettled(promisesToSettle);
    const googleAdsResult = results[0];
    const adsenseRevenue = results[1];

    const fetchTime = Date.now() - fetchStartTime;

    // Handle Google Ads data
    let googleAdsData: any;
    let message = '';

    if (googleAdsResult.status === 'rejected') {
      console.error('[ADSENSE_COST_REVENUE] Google Ads API failed:', googleAdsResult.reason);
      message += 'Google Ads: Failed. ';
      googleAdsData = { campaigns: [], ads: [] };
    } else {
      if (isMultiAccount) {
        const accountsData = googleAdsResult.value as any[];
        googleAdsData = { campaigns: [], ads: [] };

        // CRITICAL FIX: Track which accounts succeeded/failed
        let successCount = 0;
        let failedAccounts: string[] = [];

        accountsData.forEach((accountResult: any, index: number) => {
          const accData = accountResult.data;
          const accountId = accountIds[index];

          if (accData?.campaigns || accData?.ads) {
            // Account succeeded
            successCount++;
            if (accData?.campaigns) {
              accData.campaigns.forEach((c: any) => c.account_id = accountId);
              googleAdsData.campaigns.push(...accData.campaigns);
            }
            if (accData?.ads) {
              accData.ads.forEach((a: any) => a.account_id = accountId);
              googleAdsData.ads.push(...accData.ads);
            }
          } else {
            // Account failed - log it!
            failedAccounts.push(accountId);
            console.warn(`[ADSENSE_COST_REVENUE] ⚠️  Account ${accountId} returned no data: ${accountResult.message || 'Unknown error'}`);
          }
        });

        message += `Google Ads: ${successCount}/${accountsData.length} accounts, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads. `;
        console.log(`[ADSENSE_COST_REVENUE] Multi-account: ${successCount}/${accountsData.length} succeeded, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads`);

        // CRITICAL: Warn if some accounts failed (partial data)
        if (failedAccounts.length > 0) {
          console.error(`[ADSENSE_COST_REVENUE] ❌ PARTIAL DATA! ${failedAccounts.length} accounts failed: ${failedAccounts.join(', ')}`);
          message += `⚠️ Warning: ${failedAccounts.length} accounts failed! Data may be incomplete. `;
        }
      } else {
        const singleResult = googleAdsResult.value as any;
        googleAdsData = singleResult.data;
        message += `Google Ads: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads. `;
        console.log(`[ADSENSE_COST_REVENUE] Single account: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads`);
      }
    }

    // Handle AdSense data
    let adsenseData: AdSenseRevenue[] = [];
    if (adsenseRevenue.status === 'fulfilled') {
      adsenseData = adsenseRevenue.value as AdSenseRevenue[];
      message += `AdSense: ${adsenseData.length} records. `;

      // Debug: Show sample AdSense data
      if (adsenseData.length > 0) {
        const totalAdSenseRevenue = adsenseData.reduce((sum, r) => sum + r.earnings, 0);
        console.log(`[ADSENSE_COST_REVENUE] AdSense: ${adsenseData.length} records, Total: $${totalAdSenseRevenue.toFixed(2)}`);
        console.log(`[ADSENSE_COST_REVENUE] Sample AdSense records (first 3):`);
        adsenseData.slice(0, 3).forEach((r, idx) => {
          console.log(`  ${idx + 1}. Style: ${r.style_id}, Domain: ${r.domain_name}, Earnings: $${r.earnings}`);
        });
      }
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

    // Helper function to clean campaign names (remove style ID patterns)
    const cleanCampaignName = (name: string): string => {
      if (!name) return name;

      // Remove style ID patterns like:
      // - "Ch64Xstyle1" → ""
      // - "-style123" → ""
      // - " style1" → ""
      // - "16/09-UV Curing Equipment-Ch64Xstyle1" → "16/09-UV Curing Equipment"
      let cleaned = name
        .replace(/[-\s]?Ch\d+Xstyle\d+/gi, '')  // Remove -Ch64Xstyle1
        .replace(/[-\s]?style\d+/gi, '')         // Remove -style1, style123
        .replace(/[-\s]+$/,'')                   // Remove trailing dashes/spaces
        .trim();

      return cleaned || name; // Fallback to original if cleaned is empty
    };

    // Build campaign to ads mapping (URLs are in ads, not campaigns)
    // CRITICAL: Only process ads from ENABLED campaigns
    const campaignToStyleMap = new Map<string, { styleIds: Set<string>; domains: Set<string>; campaignName: string }>();

    // Track filtering stats
    let totalAds = 0;
    let enabledAds = 0;
    let skippedAds = 0;

    // Extract style_id and domain from ads
    for (const ad of googleAdsData.ads || []) {
      totalAds++;
      const campaignId = String(ad.campaign_id);

      // CRITICAL FIX: Only process ads from ENABLED campaigns
      // Google Ads API returns status as enum: 2=ENABLED, 3=PAUSED, 4=REMOVED
      const adCampaignStatus = String(ad.campaign_status || '').trim().toUpperCase();

      // Accept both numeric (2) and string (ENABLED) formats
      const isEnabled = adCampaignStatus === 'ENABLED' || adCampaignStatus === '2';

      if (adCampaignStatus && !isEnabled) {
        // Skip ads from paused/removed campaigns
        skippedAds++;
        continue;
      }
      enabledAds++;

      const finalUrls = ad.final_urls || [];

      if (!campaignToStyleMap.has(campaignId)) {
        // Get campaign name from campaigns data
        const campaign = (googleAdsData.campaigns || []).find((c: any) => String(c.campaign_id) === campaignId);
        let campaignName = campaign?.campaign_name || campaign?.name || `Campaign ${campaignId}`;

        // CLEAN campaign name: Remove style_id patterns like "Ch64Xstyle1", "style123", etc.
        campaignName = cleanCampaignName(campaignName);

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

    console.log(`[ADSENSE_COST_REVENUE] Ad filtering: ${enabledAds} ENABLED (status=2) / ${totalAds} total ads (skipped ${skippedAds} non-ENABLED)`);
    console.log(`[ADSENSE_COST_REVENUE] Extracted style_ids from ${campaignToStyleMap.size} ENABLED campaigns with ads`);

    // Debug: Show sample style_id extractions (now with normalized domains)
    let debugCount = 0;
    for (const [campaignId, data] of campaignToStyleMap.entries()) {
      if (debugCount < 3 && data.styleIds.size > 0) {
        console.log(`[ADSENSE_COST_REVENUE] Campaign ${campaignId}: styles=[${Array.from(data.styleIds).join(',')}], normalized_domains=[${Array.from(data.domains).join(',')}]`);
        debugCount++;
      }
    }

    // Build style_id+domain to campaign name mapping from current account(s) only
    const styleDomainToCampaignName = new Map<string, string>();

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

    console.log(`[ADSENSE_COST_REVENUE] Built style_id+domain to campaign name mapping for ${styleDomainToCampaignName.size} combinations`);

    // Build cost lookup by style_id + domain from campaigns
    // CRITICAL: Only process ENABLED campaigns (exclude PAUSED, REMOVED, etc.)
    const costByStyleDomain = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number; cpa: number }>();

    let totalCampaigns = 0;
    let enabledCampaigns = 0;
    let skippedCampaigns = 0;

    for (const campaign of googleAdsData.campaigns || []) {
      totalCampaigns++;
      const campaignId = String(campaign.campaign_id);
      const urlData = campaignToStyleMap.get(campaignId);

      if (!urlData || urlData.styleIds.size === 0) continue;

      // CRITICAL FIX: Only include ENABLED campaigns, skip PAUSED/REMOVED campaigns
      // Google Ads API returns status as enum: 2=ENABLED, 3=PAUSED, 4=REMOVED
      const campaignStatus = String(campaign.campaign_status || campaign.status || '').trim().toUpperCase();

      // Accept both numeric (2) and string (ENABLED) formats
      const isEnabled = campaignStatus === 'ENABLED' || campaignStatus === '2';

      if (campaignStatus && !isEnabled) {
        skippedCampaigns++;
        continue;
      }
      enabledCampaigns++;

      const cost = campaign.metrics?.cost || 0;
      const clicks = campaign.metrics?.clicks || 0;
      const impressions = campaign.metrics?.impressions || 0;

      // CRITICAL: Fetch actual conversions from Google Ads, not AdSense clicks
      const conversions = campaign.metrics?.conversions || 0;

      // Add cost for each style_id + domain combination
      for (const styleId of urlData.styleIds) {
        for (const domain of urlData.domains) {
          const key = `${styleId}_${domain}`;
          if (!costByStyleDomain.has(key)) {
            costByStyleDomain.set(key, { cost: 0, clicks: 0, impressions: 0, conversions: 0, cpa: 0 });
          }
          const existing = costByStyleDomain.get(key)!;
          existing.cost += cost;
          existing.clicks += clicks;
          existing.impressions += impressions;
          existing.conversions += conversions;
          // Average CPA across multiple campaigns for the same style_id/domain
          existing.cpa = existing.conversions > 0 ? existing.cost / existing.conversions : 0;
        }
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Campaign filtering: ${enabledCampaigns} ENABLED (status=2) / ${totalCampaigns} total campaigns (skipped ${skippedCampaigns} non-ENABLED)`);

    // Calculate total conversions from Google Ads
    const totalGoogleAdsConversions = Array.from(costByStyleDomain.values()).reduce((sum, data) => sum + data.conversions, 0);
    console.log(`[ADSENSE_COST_REVENUE] Total Google Ads conversions: ${totalGoogleAdsConversions.toFixed(2)}`);

    console.log(`[ADSENSE_COST_REVENUE] Built cost lookup for ${costByStyleDomain.size} style_id/domain combinations from ENABLED campaigns`);

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
    
    // Build revenue map - CRITICAL: Only allocate revenue for style_ids that belong to current account(s)
    const revenueByStyleDomain = new Map<string, any>();

    let totalRevenueItems = 0;
    let allocatedRevenueItems = 0;
    let skippedRevenueItems = 0;
    let totalRevenueValue = 0;
    let allocatedRevenueValue = 0;
    let skippedRevenueValue = 0;

    for (const rev of adsenseData) {
      totalRevenueItems++;
      totalRevenueValue += rev.earnings;

      const normalizedDomain = rev.domain_name ? normalizeDomain(rev.domain_name) : 'N/A';
      const key = `${rev.style_id}_${normalizedDomain}`;

      // CRITICAL FIX: Only allocate revenue if this style_id+domain belongs to the current account's campaigns
      // This prevents total revenue from being shown in each individual account
      if (!styleDomainToCampaignName.has(key)) {
        // This revenue belongs to a different account's style_id, skip it
        skippedRevenueItems++;
        skippedRevenueValue += rev.earnings;
        continue;
      }

      allocatedRevenueItems++;
      allocatedRevenueValue += rev.earnings;

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
          conversions: 0, // Actual number of conversions from Google Ads
          costClicks: 0,
          cpa: 0, // Cost per conversion (cost / conversions)
          rpc: 0,
          roi: 0,
          roas: 0
        });
      }

      const existing = revenueByStyleDomain.get(key)!;

      // Direct revenue allocation - Only revenue for THIS account's style_ids
      existing.revenue += rev.earnings;
      existing.clicks += rev.clicks;
      // Note: conversions will be populated from Google Ads data, not AdSense clicks
    }

    console.log(`[ADSENSE_COST_REVENUE] Revenue allocation: ${allocatedRevenueItems} items / $${allocatedRevenueValue.toFixed(2)} allocated to this account`);
    console.log(`[ADSENSE_COST_REVENUE] Revenue skipped: ${skippedRevenueItems} items / $${skippedRevenueValue.toFixed(2)} (belongs to other accounts)`);
    console.log(`[ADSENSE_COST_REVENUE] Revenue total: ${totalRevenueItems} items / $${totalRevenueValue.toFixed(2)}`);
    console.log(`[ADSENSE_COST_REVENUE] Processing revenue for ${revenueByStyleDomain.size} style_id/domain combinations`);

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

        // CRITICAL: Use actual Google Ads conversions (NUMBER, not percentage)
        existing.conversions = costData.conversions;

        // CRITICAL: Use actual Google Ads CPA (cost / conversions)
        existing.cpa = costData.cpa;

        existing.profit = existing.revenue - existing.cost;
        existing.roi = existing.cost > 0 ? (existing.profit / existing.cost) * 100 : 0;
        existing.roas = existing.cost > 0 ? existing.revenue / existing.cost : 0;

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
          conversions: costData.conversions, // Actual NUMBER of conversions from Google Ads
          cpa: costData.cpa, // Actual Google Ads CPA (cost / conversions)
          rpc: 0,
          roi: -100,
          roas: 0
        });
        unmatchedCost++;
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Cost mapping: ${matchedCost} matched with revenue, ${unmatchedCost} without revenue`);

    // Calculate  matrices with entry 
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

    // Debug: Show first few entries with conversions and CPA
    if (campaign_aggregated.length > 0) {
      console.log(`[ADSENSE_COST_REVENUE] Sample entries (first 3):`);
      campaign_aggregated.slice(0, 3).forEach((entry, idx) => {
        console.log(`  ${idx + 1}. Campaign: ${entry.campaign_name}`);
        console.log(`      Style: ${entry.style_id}, Domain: ${entry.domain}`);
        console.log(`      Cost: $${entry.cost.toFixed(2)}, Revenue: $${entry.revenue.toFixed(2)}, Profit: $${entry.profit.toFixed(2)}`);
        console.log(`      Conversions: ${entry.conversions} (actual number), CPA: $${entry.cpa.toFixed(2)}`);
      });
    } else {
      console.warn(`[ADSENSE_COST_REVENUE] WARNING: No entries created! Check if style_ids are being matched correctly.`);
    }

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

    // Log summary with clear conversion metrics
    console.log(`[ADSENSE_COST_REVENUE] SUMMARY:`);
    console.log(`  Total Cost: $${totalCost.toFixed(2)}, Total Revenue: $${totalRevenue.toFixed(2)}, Total Profit: $${totalProfit.toFixed(2)}`);
    console.log(`  Total Conversions: ${totalConversions} (actual number from Google Ads)`);
    console.log(`  Overall CPA: $${totalConversions > 0 ? (totalCost / totalConversions).toFixed(2) : '0.00'} (cost / conversions)`);

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

    // CRITICAL: Cache the complete cost+revenue mapping for 15 minutes
    // This ensures cost and revenue are ALWAYS fetched and stored together
    try {
      await redisCacheManager.set(cacheKey, response, {
        dataType: 'unified',
        priority: 'high'
      });
      console.log(`[ADSENSE_COST_REVENUE] ✅ Cached cost+revenue mapping for 15 minutes`);
    } catch (err) {
      console.warn('[ADSENSE_COST_REVENUE] Failed to cache response:', err);
    }

    // Disable HTTP caching (but Redis cache is used above)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
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
