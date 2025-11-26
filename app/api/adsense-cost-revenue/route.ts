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

    if (forceLive) {
      console.log('[ADSENSE_REVENUE] FORCE LIVE MODE - ALL CACHES BYPASSED ');
    }

    // IMPORTANT: Account-level caching strategy with separation of concerns
    // Instead of caching the entire combined result, we cache each account separately
    // This allows reusing cached data when switching between "all accounts" and single account views
    const CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds

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

    // ==================== ACCOUNT-LEVEL CACHING ====================
    // Helper function to get account-level cache key
    const getAccountCacheKey = (accountId: string) =>
      `adsense_cost_revenue:account:${accountId}:${adsenseAccountId}:${startDate}:${endDate}`;

    // Helper function to check cache for a single account
    const checkAccountCache = async (accountId: string) => {
      if (forceLive) return null; // Skip cache in force live mode

      try {
        const cacheKey = getAccountCacheKey(accountId);
        const cached = await redisCacheManager.get(cacheKey, {
          dataType: 'unified',
          forceRefresh: false
        });

        if (cached.data && !cached.isStale && cached.age < CACHE_TTL) {
          console.log(`[ADSENSE_COST_REVENUE] ✅ Cache HIT for account ${accountId}: Age ${Math.round(cached.age / 1000)}s`);
          return cached.data;
        }
        return null;
      } catch (err) {
        console.warn(`[ADSENSE_COST_REVENUE] Cache check failed for account ${accountId}:`, err);
        return null;
      }
    };

    // Helper function to cache a single account's data
    const cacheAccountData = async (accountId: string, data: any) => {
      try {
        const cacheKey = getAccountCacheKey(accountId);
        await redisCacheManager.set(cacheKey, data, {
          dataType: 'unified',
          priority: 'high'
        });
        console.log(`[ADSENSE_COST_REVENUE] ✅ Cached data for account ${accountId}`);
      } catch (err) {
        console.warn(`[ADSENSE_COST_REVENUE] Failed to cache account ${accountId}:`, err);
      }
    };

    // ==================== FETCH FROM APIS ====================
    if (forceLive) {
      console.log('[ADSENSE_REVENUE] ⚡ FORCE LIVE: Fetching FRESH data directly from APIs (bypassing ALL caches)...');
    } else {
      console.log('[ADSENSE_REVENUE] ⚡ Fetching data from APIs (account-level cache allowed)...');
    }

    // Check if querying "today's" data for smarter caching
    const today = new Date().toISOString().split('T')[0];
    const isToday = startDate === today || endDate === today;
    const isOnlyToday = startDate === today && endDate === today;

    console.log(`[ADSENSE_REVENUE] Date analysis: isToday=${isToday}, isOnlyToday=${isOnlyToday}`);

    const fetchStartTime = Date.now();

    // Determine if we're viewing a single account or multiple
    const isMultiAccount = accountIds && accountIds.length > 0;

    // Fetch Google Ads data with account-level caching
    let googleAdsDataPromises;
    let cachedAccountData: Map<string, any> = new Map(); // Track which accounts came from cache

    if (isMultiAccount) {
      console.log('[ADSENSE_COST_REVENUE] Fetching multiple accounts:', accountIds.length, 'accounts');

      // STEP 1: Check cache for each account
      const cacheChecks = await Promise.all(
        accountIds.map(async (accId: string) => ({
          accountId: accId,
          cached: await checkAccountCache(accId)
        }))
      );

      const cachedAccounts = cacheChecks.filter(c => c.cached !== null);
      const uncachedAccountIds = cacheChecks.filter(c => c.cached === null).map(c => c.accountId);

      console.log(`[ADSENSE_COST_REVENUE] Cache status: ${cachedAccounts.length} cached, ${uncachedAccountIds.length} need fetching`);

      // Store cached data
      cachedAccounts.forEach(c => {
        cachedAccountData.set(c.accountId, c.cached);
        console.log(`[ADSENSE_COST_REVENUE] ✅ Using cached data for account ${c.accountId}`);
      });

      if (forceLive) {
        console.log('[ADSENSE_COST_REVENUE] 🔥 Force Live: bulletproofAPI allowStale=FALSE (fresh data)');
      }

      // STEP 2: Fetch only uncached accounts
      if (uncachedAccountIds.length > 0) {
        console.log(`[ADSENSE_COST_REVENUE] Fetching ${uncachedAccountIds.length} uncached accounts: ${uncachedAccountIds.join(', ')}`);

        // CRITICAL FIX: Batch requests to prevent overwhelming API and rate limits
        const BATCH_SIZE = 3;
        const batches: string[][] = [];
        for (let i = 0; i < uncachedAccountIds.length; i += BATCH_SIZE) {
          batches.push(uncachedAccountIds.slice(i, i + BATCH_SIZE));
        }

        console.log(`[ADSENSE_COST_REVENUE] Processing ${batches.length} batches of max ${BATCH_SIZE} accounts each`);

        // Process batches sequentially
        const allResults: any[] = [];
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          console.log(`[ADSENSE_COST_REVENUE] Batch ${i + 1}/${batches.length}: Fetching ${batch.length} accounts: ${batch.join(', ')}`);

          const batchResults = await Promise.all(
            batch.map((accId: string) =>
              bulletproofAPI.getData(startDate, endDate, accId, {
                priority: isToday ? 9 : 8,
                allowStale: !forceLive, // CRITICAL: Bypass cache when forceLive=true
                maxWait: 30000,
                feedType: 'adsense'
              })
            )
          );

          allResults.push(...batchResults);
          console.log(`[ADSENSE_COST_REVENUE] Batch ${i + 1}/${batches.length}: Completed, ${batchResults.filter(r => r.data).length}/${batch.length} succeeded`);

          // Delay between batches
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        googleAdsDataPromises = Promise.resolve(allResults);
      } else {
        console.log('[ADSENSE_COST_REVENUE] All accounts cached, no API fetching needed!');
        googleAdsDataPromises = Promise.resolve([]);
      }
    } else if (customerId) {
      console.log('[ADSENSE_COST_REVENUE] Fetching single account:', customerId);

      // STEP 1: Check cache for this account
      const cachedData = await checkAccountCache(customerId);

      if (cachedData) {
        console.log('[ADSENSE_COST_REVENUE] ✅ Using cached data for account', customerId);
        cachedAccountData.set(customerId, cachedData);
        googleAdsDataPromises = Promise.resolve([]); // No need to fetch
      } else {
        // STEP 2: Fetch if not cached
        if (forceLive) {
          console.log('[ADSENSE_COST_REVENUE] 🔥 Force Live: bulletproofAPI allowStale=FALSE (fresh data)');
        } else {
          console.log('[ADSENSE_COST_REVENUE] Cache MISS, fetching from bulletproofAPI');
        }
        googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
          priority: isToday ? 9 : 8,
          allowStale: !forceLive, // CRITICAL: Bypass cache when forceLive=true
          maxWait: 30000,
          feedType: 'adsense'
        });
      }
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

        // STEP 1: Add cached account data first
        let cachedCount = 0;
        for (const [accountId, cached] of cachedAccountData.entries()) {
          if (cached?.googleAdsData?.campaigns) {
            cached.googleAdsData.campaigns.forEach((c: any) => c.account_id = accountId);
            googleAdsData.campaigns.push(...cached.googleAdsData.campaigns);
          }
          if (cached?.googleAdsData?.ads) {
            cached.googleAdsData.ads.forEach((a: any) => a.account_id = accountId);
            googleAdsData.ads.push(...cached.googleAdsData.ads);
          }
          cachedCount++;
        }

        // STEP 2: Process freshly fetched accounts
        let successCount = 0;
        let failedAccounts: string[] = [];
        const uncachedAccountIds = accountsData.length > 0 ? accountIds.filter((id: string) => !cachedAccountData.has(id)) : [];

        accountsData.forEach((accountResult: any, index: number) => {
          const accData = accountResult.data;
          const accountId = uncachedAccountIds[index];

          if (accData?.campaigns || accData?.ads) {
            // Account succeeded - add to combined data
            successCount++;
            if (accData?.campaigns) {
              accData.campaigns.forEach((c: any) => c.account_id = accountId);
              googleAdsData.campaigns.push(...accData.campaigns);
            }
            if (accData?.ads) {
              accData.ads.forEach((a: any) => a.account_id = accountId);
              googleAdsData.ads.push(...accData.ads);
            }

            // CRITICAL: Cache this account's data separately
            cacheAccountData(accountId, { googleAdsData: accData });
          } else {
            // Account failed
            failedAccounts.push(accountId);
            console.warn(`[ADSENSE_COST_REVENUE] ⚠️  Account ${accountId} returned no data: ${accountResult.message || 'Unknown error'}`);
          }
        });

        message += `Google Ads: ${cachedCount} cached + ${successCount} fetched = ${cachedCount + successCount}/${accountIds.length} accounts, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads. `;
        console.log(`[ADSENSE_COST_REVENUE] Multi-account: ${cachedCount} cached + ${successCount} fetched, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads`);

        if (failedAccounts.length > 0) {
          console.error(`[ADSENSE_COST_REVENUE] ❌ PARTIAL DATA! ${failedAccounts.length} accounts failed: ${failedAccounts.join(', ')}`);
          message += `⚠️ Warning: ${failedAccounts.length} accounts failed! `;
        }
      } else {
        // Single account
        if (cachedAccountData.has(customerId)) {
          // Use cached data
          const cached = cachedAccountData.get(customerId);
          googleAdsData = cached?.googleAdsData || { campaigns: [], ads: [] };
          message += `Google Ads: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads (cached). `;
          console.log(`[ADSENSE_COST_REVENUE] Single account: Using cached data with ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads`);
        } else {
          // Use freshly fetched data
          const singleResult = googleAdsResult.value as any;
          googleAdsData = singleResult.data;
          message += `Google Ads: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads (fresh). `;
          console.log(`[ADSENSE_COST_REVENUE] Single account: Fetched ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads`);

          // CRITICAL: Cache this account's data
          if (googleAdsData?.campaigns || googleAdsData?.ads) {
            cacheAccountData(customerId, { googleAdsData });
          }
        }
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
        .replace(/[-\s]+$/, '')                   // Remove trailing dashes/spaces
        .trim();

      return cleaned || name; // Fallback to original if cleaned is empty
    };

    // Build campaign to ads mapping (URLs are in ads, not campaigns)
    // IMPORTANT: Process ALL ads to extract style_ids, regardless of campaign status
    // Reason: We need style_id mapping even for PAUSED campaigns to correctly attribute historical cost
    const campaignToStyleMap = new Map<string, { styleIds: Set<string>; domains: Set<string>; campaignName: string; accountId: string; campaignStatus: string }>();

    // Track stats
    let totalAds = 0;
    let adsWithUrls = 0;

    // Extract style_id and domain from ALL ads
    for (const ad of googleAdsData.ads || []) {
      totalAds++;
      const campaignId = String(ad.campaign_id);
      const adCampaignStatus = String(ad.campaign_status || '').trim().toUpperCase();

      const finalUrls = ad.final_urls || [];
      if (finalUrls.length > 0) {
        adsWithUrls++;
      }

      if (!campaignToStyleMap.has(campaignId)) {
        // Get campaign name from campaigns data
        const campaign = (googleAdsData.campaigns || []).find((c: any) => String(c.campaign_id) === campaignId);
        let campaignName = campaign?.campaign_name || campaign?.name || `Campaign ${campaignId}`;
        const accountId = ad.account_id || campaign?.account_id || 'unknown';
        const campaignStatus = campaign?.campaign_status || campaign?.status || adCampaignStatus || 'UNKNOWN';

        // CLEAN campaign name: Remove style_id patterns like "Ch64Xstyle1", "style123", etc.
        campaignName = cleanCampaignName(campaignName);

        campaignToStyleMap.set(campaignId, {
          styleIds: new Set<string>(),
          domains: new Set<string>(),
          campaignName: campaignName,
          accountId: accountId,
          campaignStatus: String(campaignStatus).trim().toUpperCase()
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

    console.log(`[ADSENSE_COST_REVENUE] Ad processing: ${totalAds} total ads, ${adsWithUrls} with URLs`);
    console.log(`[ADSENSE_COST_REVENUE] Extracted style_ids from ${campaignToStyleMap.size} campaigns (ALL statuses included)`);

    // Debug: Show campaign status distribution
    const statusDistribution = new Map<string, number>();
    for (const [, data] of campaignToStyleMap.entries()) {
      const status = data.campaignStatus || 'UNKNOWN';
      statusDistribution.set(status, (statusDistribution.get(status) || 0) + 1);
    }
    console.log(`[ADSENSE_COST_REVENUE] Campaign status distribution:`, Object.fromEntries(statusDistribution));

    // Debug: Show sample style_id extractions (now with normalized domains)
    let debugCount = 0;
    for (const [campaignId, data] of campaignToStyleMap.entries()) {
      if (debugCount < 3 && data.styleIds.size > 0) {
        console.log(`[ADSENSE_COST_REVENUE] Campaign ${campaignId} (${data.campaignStatus}): styles=[${Array.from(data.styleIds).join(',')}], normalized_domains=[${Array.from(data.domains).join(',')}]`);
        debugCount++;
      }
    }

    // Build style_id+domain to campaign name and account mapping from current account(s) only
    const styleDomainToCampaignName = new Map<string, { campaignName: string; accountId: string }>();

    // CRITICAL: Track which style_ids belong to this account AND are unique to it
    const currentAccountStyleIds = new Set<string>();

    for (const [_campaignId, data] of campaignToStyleMap.entries()) {
      for (const styleId of data.styleIds) {
        currentAccountStyleIds.add(styleId);
        for (const domain of data.domains) {
          const key = `${styleId}_${domain}`;
          // If multiple campaigns use the same style_id+domain, keep the first one
          if (!styleDomainToCampaignName.has(key)) {
            styleDomainToCampaignName.set(key, {
              campaignName: data.campaignName,
              accountId: data.accountId
            });
          }
        }
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Built style_id+domain to campaign name mapping for ${styleDomainToCampaignName.size} combinations`);
    console.log(`[ADSENSE_COST_REVENUE] Current account uses ${currentAccountStyleIds.size} unique style_ids: ${Array.from(currentAccountStyleIds).slice(0, 5).join(', ')}${currentAccountStyleIds.size > 5 ? '...' : ''}`);

    // ⚠️ WARNING: Check for potential style_id sharing across accounts
    // If viewing single account, this is expected. If viewing "All", this helps debug revenue duplication
    const accountContext = isMultiAccount ? `${accountIds.length} accounts combined` : `single account ${customerId}`;
    console.log(`[ADSENSE_COST_REVENUE] Context: ${accountContext}`);

    // Build cost lookup by style_id + domain from campaigns
    // IMPORTANT: Include ALL campaigns with cost data, regardless of current status
    // Reason: A campaign might be PAUSED today but had costs yesterday - we need to count that historical cost
    const costByStyleDomain = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number; cpa: number; campaignStatus: string }>();

    let totalCampaigns = 0;
    let campaignsWithCost = 0;
    let campaignsWithoutStyleId = 0;

    for (const campaign of googleAdsData.campaigns || []) {
      totalCampaigns++;
      const campaignId = String(campaign.campaign_id);
      const urlData = campaignToStyleMap.get(campaignId);

      // Skip campaigns without style_id mapping (no ads with URLs)
      if (!urlData || urlData.styleIds.size === 0) {
        campaignsWithoutStyleId++;
        continue;
      }

      const cost = campaign.metrics?.cost || 0;
      const clicks = campaign.metrics?.clicks || 0;
      const impressions = campaign.metrics?.impressions || 0;
      const conversions = campaign.metrics?.conversions || 0;
      const campaignStatus = String(campaign.campaign_status || campaign.status || 'UNKNOWN').trim().toUpperCase();

      // Include ALL campaigns that have cost data in the date range, regardless of status
      // Historical cost is historical - doesn't matter if campaign is now PAUSED
      if (cost > 0 || clicks > 0 || impressions > 0 || conversions > 0) {
        campaignsWithCost++;
      }

      // Add cost for each style_id + domain combination
      for (const styleId of urlData.styleIds) {
        for (const domain of urlData.domains) {
          const key = `${styleId}_${domain}`;
          if (!costByStyleDomain.has(key)) {
            costByStyleDomain.set(key, { cost: 0, clicks: 0, impressions: 0, conversions: 0, cpa: 0, campaignStatus: '' });
          }
          const existing = costByStyleDomain.get(key)!;
          existing.cost += cost;
          existing.clicks += clicks;
          existing.impressions += impressions;
          existing.conversions += conversions;
          existing.campaignStatus = campaignStatus; // Track status for debugging
          // Average CPA across multiple campaigns for the same style_id/domain
          existing.cpa = existing.conversions > 0 ? existing.cost / existing.conversions : 0;
        }
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Campaign cost processing: ${campaignsWithCost} campaigns with cost / ${totalCampaigns} total (${campaignsWithoutStyleId} without style_id)`);

    // Calculate total conversions from Google Ads
    const totalGoogleAdsConversions = Array.from(costByStyleDomain.values()).reduce((sum, data) => sum + data.conversions, 0);
    const totalGoogleAdsCost = Array.from(costByStyleDomain.values()).reduce((sum, data) => sum + data.cost, 0);
    console.log(`[ADSENSE_COST_REVENUE] Total Google Ads cost: $${totalGoogleAdsCost.toFixed(2)}, conversions: ${totalGoogleAdsConversions.toFixed(2)}`);

    // DEBUG: Show first 5 cost entries
    console.log(`[ADSENSE_COST_REVENUE] 📊 First 5 COST entries:`);
    let costEntryCount = 0;
    for (const [key, data] of costByStyleDomain.entries()) {
      if (costEntryCount < 5) {
        const [styleId, ...domainParts] = key.split('_');
        const domain = domainParts.join('_');
        console.log(`  ${costEntryCount + 1}. style_id="${styleId}", domain="${domain}", cost=$${data.cost.toFixed(2)}, clicks=${data.clicks}, conversions=${data.conversions}`);
        costEntryCount++;
      }
    }

    // Debug: Show cost distribution by campaign status
    const costByStatus = new Map<string, { count: number; totalCost: number }>();
    for (const [, data] of costByStyleDomain.entries()) {
      const status = data.campaignStatus || 'UNKNOWN';
      if (!costByStatus.has(status)) {
        costByStatus.set(status, { count: 0, totalCost: 0 });
      }
      const stats = costByStatus.get(status)!;
      stats.count++;
      stats.totalCost += data.cost;
    }
    console.log(`[ADSENSE_COST_REVENUE] Cost by campaign status:`,
      Object.fromEntries(Array.from(costByStatus.entries()).map(([status, stats]) =>
        [status, `${stats.count} campaigns, $${stats.totalCost.toFixed(2)}`]
      ))
    );

    console.log(`[ADSENSE_COST_REVENUE] Built cost lookup for ${costByStyleDomain.size} style_id/domain combinations from ALL campaigns`);

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

      // CRITICAL FIX: Use STRICT style_id + domain matching
      // This prevents duplicate revenue allocation across accounts
      let shouldAllocate = styleDomainToCampaignName.has(key);
      let matchedKey = key;

      if (!shouldAllocate) {
        // This revenue belongs to a different account's style_id, skip it
        skippedRevenueItems++;
        skippedRevenueValue += rev.earnings;

        // Log first 20 skipped items for debugging (increased from 10)
        if (skippedRevenueItems <= 20) {
          const hasStyleId = currentAccountStyleIds.has(rev.style_id);
          const hasCost = costByStyleDomain.has(key);
          const reason = hasStyleId ? 'domain mismatch' : 'style_id not in account';
          console.log(`[ADSENSE_COST_REVENUE] ⚠️  SKIPPED #${skippedRevenueItems}: style=${rev.style_id}, domain=${normalizedDomain}, earnings=$${rev.earnings.toFixed(2)}, reason=${reason}, hasCost=${hasCost}, key="${key}"`);
        }
        continue;
      }

      allocatedRevenueItems++;
      allocatedRevenueValue += rev.earnings;

      // Log first 5 allocated items for debugging
      if (allocatedRevenueItems <= 5) {
        console.log(`[ADSENSE_COST_REVENUE] ✅ ALLOCATED #${allocatedRevenueItems}: style=${rev.style_id}, domain=${normalizedDomain}, country=${rev.country_name || 'N/A'}, earnings=$${rev.earnings.toFixed(2)} (exact match)`);
      }

      if (!revenueByStyleDomain.has(key)) {
        // Get the campaign name and account ID from our mapping (use matchedKey for better matching)
        const mapping = styleDomainToCampaignName.get(matchedKey) || styleDomainToCampaignName.get(key);
        const campaignName = mapping?.campaignName || `Style ${rev.style_id}`;
        const accountId = mapping?.accountId || 'unknown';

        revenueByStyleDomain.set(key, {
          account_id: accountId,
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

      // Direct revenue allocation - Exact match on style_id + domain
      existing.revenue += rev.earnings;
      existing.clicks += rev.clicks;
      // Note: conversions will be populated from Google Ads data, not AdSense clicks
    }

    console.log(`[ADSENSE_COST_REVENUE] 💰 Revenue allocation: ${allocatedRevenueItems} items / $${allocatedRevenueValue.toFixed(2)} allocated to this account (exact match)`);
    console.log(`[ADSENSE_COST_REVENUE] Revenue skipped: ${skippedRevenueItems} items / $${skippedRevenueValue.toFixed(2)} (belongs to other accounts)`);
    console.log(`[ADSENSE_COST_REVENUE] Revenue total: ${totalRevenueItems} items / $${totalRevenueValue.toFixed(2)}`);
    console.log(`[ADSENSE_COST_REVENUE] Processing revenue for ${revenueByStyleDomain.size} style_id/domain combinations`);

    // DEBUG: Show first 5 revenue entries that were allocated
    console.log(`[ADSENSE_COST_REVENUE] 📊 First 5 REVENUE entries (allocated):`);
    let revenueEntryCount = 0;
    for (const [key, data] of revenueByStyleDomain.entries()) {
      if (revenueEntryCount < 5) {
        console.log(`  ${revenueEntryCount + 1}. style_id="${data.style_id}", domain="${data.domain}", revenue=$${data.revenue.toFixed(2)}, clicks=${data.clicks}`);
        revenueEntryCount++;
      }
    }

    // DEBUG: Check for cost entries that have NO matching revenue
    console.log(`[ADSENSE_COST_REVENUE] 🔍 Checking for COST entries with NO revenue:`);
    let noRevenueCount = 0;
    let noRevenueTotalCost = 0;
    for (const [key, costData] of costByStyleDomain.entries()) {
      const revenueData = revenueByStyleDomain.get(key);
      if (!revenueData || revenueData.revenue === 0) {
        if (noRevenueCount < 10) {
          const [styleId, ...domainParts] = key.split('_');
          const domain = domainParts.join('_');
          console.log(`  ${noRevenueCount + 1}. style_id="${styleId}", domain="${domain}", cost=$${costData.cost.toFixed(2)} - NO REVENUE`);
        }
        noRevenueCount++;
        noRevenueTotalCost += costData.cost;
      }
    }
    console.log(`[ADSENSE_COST_REVENUE] ⚠️ Total: ${noRevenueCount} cost entries with NO revenue, total cost: $${noRevenueTotalCost.toFixed(2)}`);

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

        // Get the campaign name and account ID from our mapping
        const mapping = styleDomainToCampaignName.get(key);
        const campaignName = mapping?.campaignName || `Style ${styleId}`;
        const accountId = mapping?.accountId || 'unknown';

        revenueByStyleDomain.set(key, {
          account_id: accountId,
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
        console.log(`      Account: ${entry.account_id}, Style: ${entry.style_id}, Domain: ${entry.domain}`);
        console.log(`      Cost: $${entry.cost.toFixed(2)}, Revenue: $${entry.revenue.toFixed(2)}, Profit: $${entry.profit.toFixed(2)}`);
        console.log(`      Conversions: ${entry.conversions} (actual number), CPA: $${entry.cpa.toFixed(2)}`);
      });
    } else {
      console.warn(`[ADSENSE_COST_REVENUE] WARNING: No entries created! Check if style_ids are being matched correctly.`);
    }

    // CRITICAL: Create account-level aggregation
    // Group all style+domain entries by account_id
    const accountAggregationMap = new Map<string, {
      account_id: string;
      cost: number;
      revenue: number;
      profit: number;
      clicks: number;
      impressions: number;
      conversions: number;
      campaignCount: number;
    }>();

    for (const entry of campaign_aggregated) {
      const accountId = entry.account_id || 'unknown';

      if (!accountAggregationMap.has(accountId)) {
        accountAggregationMap.set(accountId, {
          account_id: accountId,
          cost: 0,
          revenue: 0,
          profit: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          campaignCount:0,
        });
      }

      const accountData = accountAggregationMap.get(accountId)!;
      accountData.cost += entry.cost;
      accountData.revenue += entry.revenue;
      accountData.profit += entry.profit;
      accountData.clicks += entry.clicks;
      accountData.impressions += entry.impressions;
      accountData.conversions += entry.conversions;
      accountData.campaignCount++;
    }

    // Convert to array and calculate derived metrics
    const account_level_aggregated = Array.from(accountAggregationMap.values())
      .map(account => ({
        ...account,
        roi: account.cost > 0 ? (account.profit / account.cost) * 100 : 0,
        roas: account.cost > 0 ? account.revenue / account.cost : 0,
        cpa: account.conversions > 0 ? account.cost / account.conversions : 0,
        rpc: account.clicks > 0 ? account.revenue / account.clicks : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);

    console.log(`[ADSENSE_COST_REVENUE] Created account-level aggregation for ${account_level_aggregated.length} accounts`);
    if (account_level_aggregated.length > 0) {
      console.log(`[ADSENSE_COST_REVENUE] Account-level summary (first 3):`);
      account_level_aggregated.slice(0, 3).forEach((account, idx) => {
        console.log(`  ${idx + 1}. Account: ${account.account_id}`);
        console.log(`      Campaigns: ${account.campaignCount}, Cost: $${account.cost.toFixed(2)}, Revenue: $${account.revenue.toFixed(2)}, Profit: $${account.profit.toFixed(2)}`);
        console.log(`      ROI: ${account.roi.toFixed(2)}%, Conversions: ${account.conversions}`);
      });
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
      account_level_aggregated,
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
        uniqueCountries: uniqueCountries.size,
        totalAccounts: account_level_aggregated.length,
        profitableAccounts: account_level_aggregated.filter(a => a.profit > 0).length
      },
      _source: 'adsense_cost_revenue_mapped',
      _timestamp: new Date().toISOString(),
      _fetchTime: `${fetchTime}ms`,
      _loadTime: `${Date.now() - startTime}ms`,
      _message: message.trim()
    };

    // Note: Caching is handled at the account level earlier in the code (see getAccountCacheKey)
    // Each account's data is cached separately for better reusability

    // Disable HTTP caching (account-level Redis cache is used above)
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
