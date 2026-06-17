import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAdSenseRevenueByStyleId,
  fetchAdSenseDomainEarnings,
  extractStyleIdFromUrl,
  extractChannelIdFromUrl,
  extractDomainFromUrl,
  buildCompositeKey,
  type AdSenseRevenue
} from '@/lib/adsense-api';
import { cookies } from 'next/headers';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { redisCacheManager } from '@/lib/redis-cache-manager';
import { ACCOUNT_FEED_ACCESS, hasAccessToFeed, type FeedType } from '@/lib/account-access-control';
import { getAccountCurrency } from '@/lib/currency-converter';
import { convertToUsd } from '@/lib/currency-service';

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
    const { startDate, endDate, customerId, accountIds, forceLive, adsenseAccountType } = body;
    let { adsenseAccountId } = body;

    // Determine feed type based on account type
    const requiredFeedType =
      adsenseAccountType === 'carhp' ? 'carhp'
      : adsenseAccountType === 'thefactrelay' ? 'thefactrelay'
      : adsenseAccountType === 'androidadvice' ? 'androidadvice'
      : 'adsense';

    // Server-side publisher ID resolution: never trust the client for a publisher ID
    // tied to a feed type. Each feed has exactly one publisher; the server picks it
    // from this map so a request can't cross-pollinate one feed's data into another.
    // 'adsense' (default AFS) has multiple pub IDs per customer, so it stays client-driven.
    const FEED_PUBLISHER_IDS: Record<string, string | undefined> = {
      carhp: 'accounts/pub-4304762948491681',
      thefactrelay: 'accounts/pub-6567805284657549',
      androidadvice: process.env.ANDROIDADVICE_PUBLISHER_ID,
    };
    const expectedPubId = FEED_PUBLISHER_IDS[adsenseAccountType];
    if (expectedPubId) {
      if (adsenseAccountId && adsenseAccountId !== expectedPubId) {
        console.warn(`[ADSENSE_REVENUE] Client sent pub ID ${adsenseAccountId} for ${adsenseAccountType}, overriding with server-configured ${expectedPubId}`);
      }
      adsenseAccountId = expectedPubId;
    } else if (adsenseAccountType === 'androidadvice') {
      console.error('[ADSENSE_REVENUE] ANDROIDADVICE_PUBLISHER_ID env var is not set');
      return NextResponse.json({
        error: 'Server misconfiguration',
        message: 'ANDROIDADVICE_PUBLISHER_ID is not configured'
      }, { status: 500 });
    }

    console.log('[ADSENSE_REVENUE] ===== REQUEST START =====');
    console.log('[ADSENSE_REVENUE] Date range:', startDate, 'to', endDate);
    console.log('[ADSENSE_REVENUE] AdSense Account:', adsenseAccountId);
    console.log('[ADSENSE_REVENUE] Account Type:', adsenseAccountType || 'afs (default)');
    console.log('[ADSENSE_REVENUE] Required Feed Type:', requiredFeedType);
    console.log('[ADSENSE_REVENUE] Customer ID:', customerId);
    console.log('[ADSENSE_REVENUE] Account IDs:', accountIds);
    console.log('[ADSENSE_REVENUE] Force Live:', forceLive || false);

    if (forceLive) {
      console.log('[ADSENSE_REVENUE] FORCE LIVE MODE - ALL CACHES BYPASSED ');
    }
    // AGGRESSIVE CACHING OPTIMIZATION: Dramatically increased TTLs to reduce API quota usage
    // AFS data doesn't change frequently - hourly refresh is sufficient for most use cases
    // Previous: 15 min = 96 potential refreshes/day × 140 API calls = 13,440 calls/day
    // New: 2 hour aggregated, 1 hour individual = ~12 refreshes/day × 140 = 1,680 calls/day
    // Savings: 11,760 API calls/day (87% reduction!)
    const ACCOUNT_CACHE_TTL = 60 * 60 * 1000; // 1 hour (3600 seconds) - individual accounts
    const AGGREGATED_CACHE_TTL = 2 * 60 * 60; // 2 hours (7200 seconds) - "All Accounts" view 

    // Generate aggregated cache key with feed type isolation
    const accountsKey = accountIds?.length > 0
      ? accountIds.sort().join(',')
      : customerId || 'unknown';
    const feedPrefix =
      requiredFeedType === 'carhp' ? 'carhp'
      : requiredFeedType === 'thefactrelay' ? 'thefactrelay'
      : requiredFeedType === 'androidadvice' ? 'androidadvice'
      : 'afs';
    const aggregatedCacheKey = `${feedPrefix}_aggregated:${accountsKey}:${adsenseAccountId}:${startDate}:${endDate}`;

    // Check aggregated cache FIRST (unless force refresh)
    if (!forceLive) {
      try {
        const cachedResult = await redisCacheManager.get(aggregatedCacheKey, {
          dataType: 'unified',
          forceRefresh: false
        });

        if (cachedResult.data && cachedResult.age < AGGREGATED_CACHE_TTL * 1000) {
          const cacheAgeSeconds = Math.round(cachedResult.age / 1000);
          console.log(`[ADSENSE_REVENUE] AGGREGATED CACHE HIT! Age: ${cacheAgeSeconds}s, returning consistent data`);

          return NextResponse.json({
            ...cachedResult.data,
            _source: 'aggregated_cache',
            _cacheAge: `${cacheAgeSeconds}s`,
            _message: `Served from cache (${cacheAgeSeconds}s old). Use Force Refresh for live data.`
          });
        }
        console.log(`[ADSENSE_REVENUE] Aggregated cache miss or stale, fetching fresh data...`);
      } catch (err) {
        console.warn('[ADSENSE_REVENUE] Aggregated cache check failed:', err);
      }
    }

    const CACHE_TTL = ACCOUNT_CACHE_TTL; // Keep for backward compat

    if (!startDate || !endDate) {
      console.error('[ADSENSE_REVENUE] Missing date range');
      return NextResponse.json({ error: 'Missing startDate or endDate' }, { status: 400 });
    }

    if (!adsenseAccountId) {
      console.error('[ADSENSE_REVENUE] Missing adsenseAccountId');
      return NextResponse.json({ error: 'Missing adsenseAccountId' }, { status: 400 });
    }

    // ENHANCED: Proper auth check with ACCOUNT_FEED_ACCESS validation
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;
    const userAccountId = cookieStore.get('account_id')?.value;

    // Validate all requested accounts have AFS access
    const requestedAccountIds: string[] = [];
    if (customerId) {
      requestedAccountIds.push(customerId);
    }
    if (accountIds && accountIds.length > 0) {
      requestedAccountIds.push(...accountIds);
    }

    // Check each requested account has required feed access ('adsense' or 'carhp')
    for (const accId of requestedAccountIds) {
      const normalizedAccId = accId.startsWith('CID_') ? accId : `CID_${accId}`;

      // Verify account exists in ACCOUNT_FEED_ACCESS
      if (!ACCOUNT_FEED_ACCESS[normalizedAccId]) {
        console.error(`[ADSENSE_REVENUE] Access denied: Account ${normalizedAccId} not found in ACCOUNT_FEED_ACCESS`);
        return NextResponse.json({
          error: 'Invalid account ID',
          message: `Account ${accId} is not configured`
        }, { status: 403 });
      }

      // Verify account has required feed permission ('adsense' or 'carhp')
      if (!hasAccessToFeed(normalizedAccId, requiredFeedType)) {
        console.error(`[ADSENSE_REVENUE] Access denied: Account ${normalizedAccId} does not have adsense feed access`);
        return NextResponse.json({
          error: 'Access denied',
          message: `Account ${accId} does not have AFS access`
        }, { status: 403 });
      }
    }

    // For regular users, enforce they can only access their own account
    if (authType === 'user' && userAccountId) {
      console.log('[ADSENSE_REVENUE] User access:', userAccountId);

      const normalizedUserAccountId = userAccountId.startsWith('CID_') ? userAccountId : `CID_${userAccountId}`;
      const accountValue = normalizedUserAccountId.replace('CID_', '');

      // Check single account access
      if (customerId && customerId !== accountValue) {
        console.error(`[ADSENSE_REVENUE] User ${userAccountId} attempted to access account ${customerId}`);
        return NextResponse.json({ error: 'Access denied to this account' }, { status: 403 });
      }

      // Check multi-account access
      if (accountIds && accountIds.length > 0) {
        const hasUnauthorized = accountIds.some((id: string) => id !== accountValue);
        if (hasUnauthorized) {
          console.error(`[ADSENSE_REVENUE] User ${userAccountId} attempted to access unauthorized accounts: ${accountIds.join(', ')}`);
          return NextResponse.json({ error: 'Access denied to requested accounts' }, { status: 403 });
        }
      }

      console.log(`[ADSENSE_REVENUE] User ${userAccountId} authorized for requested accounts`);
    } else if (authType === 'admin') {
      console.log(`[ADSENSE_REVENUE] Admin access granted for ${requestedAccountIds.length} account(s)`);
    }

    // Track unmapped geo IDs for logging (helps identify missing mappings)
    const unmappedGeoIds = new Set<string>();

    // Convert Google Ads geo target criterion ID to 2-letter ISO country code
    // ROBUST APPROACH: Uses comprehensive mapping + intelligent fallbacks
    // Source: https://developers.google.com/google-ads/api/data/geotargets
    const getCountryCodeFromGeoId = (geoId: string | number, campaignName?: string): string => {
      if (!geoId) return '';

      const geoIdStr = String(geoId).trim();

      // STEP 1: Check if it's already a 2-letter country code
      if (geoIdStr.length === 2 && /^[A-Z]{2}$/i.test(geoIdStr)) {
        return geoIdStr.toUpperCase();
      }

      // STEP 2: Comprehensive geo target ID to country code mapping (most common countries)
      const geoIdToCountry: Record<string, string> = {
        // North America
        '2840': 'US', '2124': 'CA', '2484': 'MX',
        // South America
        '2076': 'BR', '2032': 'AR', '2152': 'CL', '2170': 'CO', '2604': 'PE', '2862': 'VE', '2218': 'EC', '2858': 'UY', '2600': 'PY', '2068': 'BO',
        // Europe
        '2826': 'GB', '2276': 'DE', '2250': 'FR', '2380': 'IT', '2724': 'ES', '2528': 'NL', '2752': 'SE', '2578': 'NO', '2208': 'DK', '2246': 'FI',
        '2756': 'CH', '2040': 'AT', '2056': 'BE', '2372': 'IE', '2616': 'PL', '2642': 'RO', '2203': 'CZ', '2348': 'HU', '2300': 'GR', '2620': 'PT',
        '2643': 'RU', '2804': 'UA', '2100': 'BG', '2191': 'HR', '2703': 'SK', '2705': 'SI', '2440': 'LT', '2428': 'LV', '2233': 'EE', '2498': 'MD',
        // Asia-Pacific
        '2356': 'IN', '2360': 'ID', '2764': 'TH', '2704': 'VN', '2608': 'PH', '2458': 'MY', '2702': 'SG', '2392': 'JP', '2410': 'KR', '2344': 'HK',
        '2158': 'TW', '2554': 'NZ', '2036': 'AU', '2586': 'PK', '2050': 'BD', '2144': 'LK', '2104': 'MM', '2116': 'KH', '2418': 'KW', '2512': 'OM',
        '2634': 'QA', '2048': 'BH', '2096': 'BN', '2462': 'MV', '2524': 'NP', '2156': 'CN', '2446': 'MO', '2496': 'MN',
        // Middle East & Africa
        '2784': 'AE', '2682': 'SA', '2376': 'IL', '2792': 'TR', '2818': 'EG', '2710': 'ZA', '2566': 'NG', '2404': 'KE', '2504': 'MA', '2012': 'DZ',
        '2788': 'TN', '2434': 'LY', '2288': 'GH', '2854': 'TZ', '2800': 'UG', '2748': 'SZ', '2120': 'CM', '2174': 'CD', '2178': 'CG', '2466': 'ML',
        '2768': 'TG', '2384': 'CI', '2729': 'SD', '2231': 'ET', '2508': 'MZ', '2894': 'ZM', '2716': 'ZW', '2072': 'BW', '2478': 'MR', '2454': 'MW',
        // Central America & Caribbean
        '2188': 'CR', '2630': 'PA', '2320': 'GT', '2340': 'HN', '2558': 'NI', '2222': 'SV', '2214': 'DO', '2192': 'CU', '2388': 'JM', '2780': 'TT',
      };

      const countryCode = geoIdToCountry[geoIdStr];
      if (countryCode) {
        return countryCode;
      }

      // STEP 3: FALLBACK - Try to extract from campaign name if provided
      if (campaignName) {
        // Check for 2-letter country code in campaign name (e.g., " - US", " - TH")
        const countryMatch = campaignName.match(/(?:-|\s)\s*([A-Z]{2})(?:\s*#\d+)?$/i);
        if (countryMatch) {
          const extracted = countryMatch[1].toUpperCase();
          // Validate it's likely a country code (not random 2 letters)
          if (['US', 'CA', 'GB', 'AU', 'TH', 'IN', 'ID', 'VN', 'PH', 'MY', 'SG', 'JP', 'KR', 'CN', 'BR', 'MX', 'FR', 'DE', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI', 'PL', 'TR', 'EG', 'ZA', 'NG', 'KE'].includes(extracted)) {
            console.log(`[GEO_MAPPING] Geo ID ${geoIdStr} not in map, extracted "${extracted}" from campaign name: ${campaignName}`);
            return extracted;
          }
        }
      }

      // STEP 4: Log unmapped geo IDs for future addition to the mapping
      if (!unmappedGeoIds.has(geoIdStr)) {
        unmappedGeoIds.add(geoIdStr);
        console.warn(`[GEO_MAPPING] ⚠️ Unknown geo target ID: ${geoIdStr}${campaignName ? ` (campaign: ${campaignName})` : ''} - Please add to mapping or check campaign name format`);
      }

      // STEP 5: Return empty string for unknown geo IDs
      // This will trigger fallback to campaign name extraction in the calling code
      return '';
    };

    // Convert country name to 2-letter ISO code for flags
    // IMPORTANT: Always returns UPPERCASE 2-letter ISO country code.
    // All geo keys (cost side + revenue side) must use the same format to match correctly.
    const getCountryCode = (countryName: string): string => {
      if (!countryName || countryName === 'N/A') return '';

      // If it's already a 2-letter code, normalize to uppercase and return
      const trimmed = countryName.trim();
      if (trimmed.length === 2) {
        return trimmed.toUpperCase();
      }

      // Full name lookup — all values are uppercase
      const lookup: Record<string, string> = {
        'united states': 'US', 'usa': 'US', 'canada': 'CA', 'united kingdom': 'GB', 'uk': 'GB',
        'australia': 'AU', 'germany': 'DE', 'france': 'FR', 'italy': 'IT', 'spain': 'ES',
        'netherlands': 'NL', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
        'switzerland': 'CH', 'austria': 'AT', 'belgium': 'BE', 'ireland': 'IE', 'new zealand': 'NZ',
        'japan': 'JP', 'south korea': 'KR', 'singapore': 'SG', 'hong kong': 'HK', 'taiwan': 'TW',
        'brazil': 'BR', 'mexico': 'MX', 'argentina': 'AR', 'colombia': 'CO', 'chile': 'CL',
        'india': 'IN', 'indonesia': 'ID', 'thailand': 'TH', 'vietnam': 'VN', 'philippines': 'PH',
        'malaysia': 'MY', 'south africa': 'ZA', 'nigeria': 'NG', 'kenya': 'KE', 'egypt': 'EG',
        'united arab emirates': 'AE', 'uae': 'AE', 'saudi arabia': 'SA', 'israel': 'IL', 'turkey': 'TR',
        'poland': 'PL', 'romania': 'RO', 'czech republic': 'CZ', 'hungary': 'HU', 'greece': 'GR',
        'portugal': 'PT', 'russia': 'RU', 'ukraine': 'UA', 'pakistan': 'PK', 'bangladesh': 'BD',
        'sri lanka': 'LK', 'nepal': 'NP', 'laos': 'LA', 'cambodia': 'KH', 'myanmar': 'MM',
        'somalia': 'SO', 'nicaragua': 'NI', 'dominican republic': 'DO', 'saudi': 'SA'
      };

      return (lookup[trimmed.toLowerCase()] || trimmed).toUpperCase();
    };

    // Helper function to get account-level cache key with feed type isolation
    const getAccountCacheKey = (accountId: string) =>
      `${feedPrefix}_cost_revenue:account:${accountId}:${adsenseAccountId}:${startDate}:${endDate}`;

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
          const ageMinutes = Math.round(cached.age / 60000);
          console.log(`[ADSENSE_COST_REVENUE] Cache HIT for account ${accountId}: Age ${Math.round(cached.age / 1000)}s (${ageMinutes} min)`);
          return cached.data;
        }

        // Cache miss or stale
        if (cached.data) {
          console.log(`[ADSENSE_COST_REVENUE] Cache STALE for account ${accountId}: Age ${Math.round(cached.age / 1000)}s (>${CACHE_TTL / 1000}s TTL)`);
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
          ttl: CACHE_TTL / 1000,
          dataType: 'unified',
          priority: 'high'
        });
        console.log(`[ADSENSE_COST_REVENUE] Cached data for account ${accountId}`);
      } catch (err) {
        console.warn(`[ADSENSE_COST_REVENUE] Failed to cache account ${accountId}:`, err);
      }
    };
    if (forceLive) {
      console.log('[ADSENSE_REVENUE] FORCE LIVE: Fetching FRESH data directly from APIs (bypassing ALL caches)...');
    } else {
      console.log('[ADSENSE_REVENUE] Fetching data from APIs (account-level cache allowed)...');
    }

    // Check if querying "today's" data for smarter caching
    const today = new Date().toISOString().split('T')[0];
    const isToday = startDate === today || endDate === today;
    const isOnlyToday = startDate === today && endDate === today;

    console.log(`[ADSENSE_REVENUE] Date analysis: isToday=${isToday}, isOnlyToday=${isOnlyToday}`);

    const fetchStartTime = Date.now();

    // Track per-account data-quality issues so the response can flag inconsistent cost
    // even when the request technically "succeeded". Two distinct buckets:
    //  - dq_failedAccountIds:      account returned no campaigns/ads at all (after retries)
    //  - dq_partialCostAccountIds: account returned campaigns but cost looks broken
    //                              (clicks > 0 yet metrics.cost summed to 0 — impossible
    //                              in a healthy Google Ads response, so the cost query
    //                              almost certainly failed for this account)
    const dq_failedAccountIds: string[] = [];
    const dq_partialCostAccountIds: string[] = [];

    // Determine if we're viewing a single account or multiple
    const isMultiAccount = accountIds && accountIds.length > 0;

    // Fetch Google Ads data with account-level caching
    let googleAdsDataPromises;
    let cachedAccountData: Map<string, any> = new Map();

    if (isMultiAccount) {
      console.log('[ADSENSE_COST_REVENUE] Fetching multiple accounts:', accountIds.length, 'accounts');

      // STEP 1: Check cache for each account (SKIP if forceLive=true)
      let cachedAccounts: any[] = [];
      let uncachedAccountIds: string[] = accountIds;

      if (!forceLive) {
        const cacheChecks = await Promise.all(
          accountIds.map(async (accId: string) => ({
            accountId: accId,
            cached: await checkAccountCache(accId)
          }))
        );

        cachedAccounts = cacheChecks.filter(c => c.cached !== null);
        uncachedAccountIds = cacheChecks.filter(c => c.cached === null).map(c => c.accountId);

        console.log(`[ADSENSE_COST_REVENUE] Cache status: ${cachedAccounts.length} cached, ${uncachedAccountIds.length} need fetching`);

        // Store cached data
        cachedAccounts.forEach(c => {
          cachedAccountData.set(c.accountId, c.cached);
          console.log(`[ADSENSE_COST_REVENUE] Using cached data for account ${c.accountId}`);
        });
      } else {
        console.log('[ADSENSE_COST_REVENUE] FORCE LIVE: Bypassing account-level cache for ALL accounts');
      }

      if (forceLive) {
        console.log('[ADSENSE_COST_REVENUE] Force Live: Fetching fresh data (with stale cache fallback for reliability)');
      }

      // STEP 2: Fetch only uncached accounts (OR all accounts if forceLive=true)
      if (uncachedAccountIds.length > 0) {
        console.log(`[ADSENSE_COST_REVENUE] Fetching ${uncachedAccountIds.length} uncached accounts: ${uncachedAccountIds.join(', ')}`);

        // Concurrency tuning. The QPS=2 rate limiter check is non-atomic (single
        // "last request" timestamp in redis), so bursts within the same JS tick
        // don't actually get denied — the real ceiling is Google Ads' upstream
        // hourly/daily quota. The symmetric campaigns/ads guards in
        // lib/google-ads-api.ts now throw on partial failures, and the stale-cache
        // fallback in bulletproof-google-ads-api.ts handles cooldowns, so we no
        // longer need 1-at-a-time pacing for correctness.
        //   - 4 accounts in parallel: 18 accounts / 4 = 5 batches × ~600ms gap +
        //     API latency ≈ 10–15s for Force Refresh (was 1–2 minutes at batch=1).
        //   - Normal fetch reuses the same pacing; with most accounts cached the
        //     parallelism doesn't matter much there.
        const BATCH_SIZE = 4;
        const INTER_BATCH_DELAY_MS = 600;
        const MAX_RETRIES = 3;
        const batches: string[][] = [];
        for (let i = 0; i < uncachedAccountIds.length; i += BATCH_SIZE) {
          batches.push(uncachedAccountIds.slice(i, i + BATCH_SIZE));
        }

        console.log(`[ADSENSE_COST_REVENUE] Processing ${batches.length} batches of max ${BATCH_SIZE} accounts each`);

        // Process batches sequentially with results tracking
        const allResults: Map<string, any> = new Map();
        let failedAccountIds: string[] = [];

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          console.log(`[ADSENSE_COST_REVENUE] Batch ${i + 1}/${batches.length}: Fetching ${batch.length} accounts: ${batch.join(', ')}`);

          const batchResults = await Promise.all(
            batch.map(async (accId: string) => {
              const result = await bulletproofAPI.getData(startDate, endDate, accId, {
                priority: isToday ? 9 : 8,
                // CRITICAL FIX: Respect forceLive flag to bypass Google Ads cache
                // When forceLive=true, allowStale=false forces fresh API fetch with geo_targets
                // When forceLive=false, allowStale=true allows stale cache fallback for reliability
                allowStale: !forceLive,
                maxWait: forceLive ? 60000 : 45000,
                feedType: requiredFeedType as FeedType
              });
              return { accId, result };
            })
          );

          // Track successes and failures
          batchResults.forEach(({ accId, result }) => {
            if (result.data?.campaigns || result.data?.ads) {
              allResults.set(accId, result);
            } else {
              failedAccountIds.push(accId);
              console.warn(`[ADSENSE_COST_REVENUE] Account ${accId} failed in batch ${i + 1}: ${result.message}`);
            }
          });

          console.log(`[ADSENSE_COST_REVENUE] Batch ${i + 1}/${batches.length}: ${allResults.size} total successes, ${failedAccountIds.length} failures`);

          // Always wait between batches so the next 2 calls don't collide with the
          // limiter's QPS window. (Was previously only honored on force-refresh, which
          // is what allowed the silent rate-limit failures on normal fetches too.)
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY_MS));
          }
        }

        // CRITICAL: Retry failed accounts to ensure data consistency.
        // Retry path must ALSO respect QPS=2 — firing Promise.all on every still-failed
        // account is exactly what caused the original problem on the first pass.
        for (let retry = 0; retry < MAX_RETRIES && failedAccountIds.length > 0; retry++) {
          console.log(`[ADSENSE_COST_REVENUE] Retry ${retry + 1}/${MAX_RETRIES}: Retrying ${failedAccountIds.length} failed accounts: ${failedAccountIds.join(', ')}`);

          // Increasing backoff before the retry batch starts: 1s, 1.5s, 2s
          await new Promise(resolve => setTimeout(resolve, (retry + 1) * 500 + 500));

          const retryResults: Array<{ accId: string; result: any }> = [];
          // Same QPS-aware micro-batching as the first pass.
          for (let j = 0; j < failedAccountIds.length; j += BATCH_SIZE) {
            const microBatch = failedAccountIds.slice(j, j + BATCH_SIZE);
            const microResults = await Promise.all(
              microBatch.map(async (accId: string) => {
                const result = await bulletproofAPI.getData(startDate, endDate, accId, {
                  priority: 10, // Highest priority for retries
                  allowStale: true, // Accept any data on retry
                  maxWait: 90000, // Very long timeout for retries
                  feedType: requiredFeedType as FeedType
                });
                return { accId, result };
              })
            );
            retryResults.push(...microResults);
            if (j + BATCH_SIZE < failedAccountIds.length) {
              await new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY_MS));
            }
          }

          // Process retry results
          const stillFailedIds: string[] = [];
          retryResults.forEach(({ accId, result }) => {
            if (result.data?.campaigns || result.data?.ads) {
              allResults.set(accId, result);
              console.log(`[ADSENSE_COST_REVENUE] Retry succeeded for account ${accId}`);
            } else {
              stillFailedIds.push(accId);
            }
          });

          failedAccountIds = stillFailedIds;
        }

        if (failedAccountIds.length > 0) {
          console.error(`[ADSENSE_COST_REVENUE] CRITICAL: ${failedAccountIds.length} accounts failed after all retries: ${failedAccountIds.join(', ')}`);
          // Surface in API response so the UI can warn the user that cost is incomplete.
          dq_failedAccountIds.push(...failedAccountIds);
        }

        console.log(`[ADSENSE_COST_REVENUE] Final: ${allResults.size}/${uncachedAccountIds.length} accounts fetched successfully`);

        // Convert map to array for processing, ensuring accountId is attached
        googleAdsDataPromises = Promise.resolve(
          Array.from(allResults.entries()).map(([accountId, result]) => ({
            accountId,
            ...result
          }))
        );
      } else {
        console.log('[ADSENSE_COST_REVENUE] All accounts cached, no API fetching needed!');
        googleAdsDataPromises = Promise.resolve([]);
      }
    } else if (customerId) {
      console.log('[ADSENSE_COST_REVENUE] Fetching single account:', customerId);

      // STEP 1: Check cache for this account (SKIP if forceLive=true)
      const cachedData = forceLive ? null : await checkAccountCache(customerId);

      if (cachedData && !forceLive) {
        console.log('[ADSENSE_COST_REVENUE] Using cached data for account', customerId);
        cachedAccountData.set(customerId, cachedData);
        googleAdsDataPromises = Promise.resolve([]); // No need to fetch
      } else {
        // STEP 2: Fetch if not cached OR if forceLive=true
        if (forceLive) {
          console.log('[ADSENSE_COST_REVENUE] FORCE LIVE: Bypassing account-level cache, fetching fresh data');
        } else {
          console.log('[ADSENSE_COST_REVENUE] Cache MISS, fetching from bulletproofAPI');
        } 
        googleAdsDataPromises = bulletproofAPI.getData(startDate, endDate, customerId, {
          priority: isToday ? 9 : 8,
          allowStale: !forceLive, // CRITICAL: Bypass cache when forceLive=true
          maxWait: 30000,
          feedType: requiredFeedType as FeedType
        });
      }
    } else {
      throw new Error('No Google Ads account specified');
    }

    // For androidadvice we also pull a domain-level earnings total so we can report the
    // true androidadvices.com revenue even when per-channel attribution is partial (a
    // channel may exist on AdSense but not yet be wired into a Google Ads campaign URL).
    const isAndroidadvice = requiredFeedType === 'androidadvice';
    const promisesToSettle: Promise<any>[] = [
      googleAdsDataPromises,
      fetchAdSenseRevenueByStyleId(adsenseAccountId, startDate, endDate, customerId, adsenseAccountType),
    ];
    if (isAndroidadvice) {
      promisesToSettle.push(
        fetchAdSenseDomainEarnings(adsenseAccountId, startDate, endDate, customerId, adsenseAccountType)
      );
    }

    const results = await Promise.allSettled(promisesToSettle);
    const googleAdsResult = results[0];
    const adsenseRevenue = results[1];
    const domainEarningsResult = isAndroidadvice ? results[2] : null;
    const androidadviceDomainTotal: number = (
      isAndroidadvice && domainEarningsResult?.status === 'fulfilled'
        ? ((domainEarningsResult.value as Record<string, number>)['androidadvices.com'] ?? 0)
        : 0
    );
    if (isAndroidadvice) {
      console.log(`[ADSENSE_COST_REVENUE] androidadvices.com domain total: $${androidadviceDomainTotal.toFixed(2)}`);
    }

    const fetchTime = Date.now() - fetchStartTime;

    // CRITICAL: Check for complete API failures BEFORE processing
    // Relaxed for CARHP: If Google Ads fails, we still want to show AdSense Revenue
    if (googleAdsResult.status === 'rejected') {
      console.warn('[ADSENSE_COST_REVENUE] WARNING: Google Ads API REJECTED:', googleAdsResult.reason, '- Proceeding to fetch AdSense revenue only.');
    }

    if (adsenseRevenue.status === 'rejected') {
      console.error('[ADSENSE_COST_REVENUE]  CRITICAL: AdSense API REJECTED:', adsenseRevenue.reason);
      return NextResponse.json({
        error: 'AdSense API failed',
        message: 'Failed to fetch revenue data from AdSense API',
        details: adsenseRevenue.reason,
        _loadTime: `${Date.now() - startTime}ms`
      }, { status: 503 });
    }

    // Handle Google Ads data
    let googleAdsData: any = { campaigns: [], ads: [] };
    let message = '';

    // DEBUG: Log what we're expecting
    console.log(`[ADSENSE_COST_REVENUE] ===== GOOGLE ADS DATA PROCESSING =====`);
    console.log(`[ADSENSE_COST_REVENUE] Expected customerId: ${customerId}`);
    console.log(`[ADSENSE_COST_REVENUE] Is multi-account: ${isMultiAccount}`);
    console.log(`[ADSENSE_COST_REVENUE] Account IDs array: ${accountIds}`);

    // CRITICAL: Even if Promise resolved, check if bulletproofAPI returned null data
    const googleAdsResultValue = googleAdsResult.status === 'fulfilled' ? (googleAdsResult.value as any) : undefined;

    if (isMultiAccount) {
      // For multi-account, value is array of results
      const accountsData = googleAdsResultValue as any[] || [];

      // Check if we got empty results (all accounts failed)
      if (!accountsData || accountsData.length === 0) {
        console.warn('[ADSENSE_COST_REVENUE] WARNING: All accounts returned empty Google Ads data! Proceeding with Revenue only.');
      }
    } else {
      // For single account, check if bulletproofAPI returned null data
      if (!googleAdsResultValue || googleAdsResultValue.data === null || googleAdsResultValue.data === undefined) {
        console.warn('[ADSENSE_COST_REVENUE] WARNING: bulletproofAPI returned null/undefined data! Proceeding with Revenue only.');
      } else {
        // Check if data structure is valid
        const data = googleAdsResultValue.data;
        if (!data || (!data.campaigns && !data.ads)) {
          console.warn('[ADSENSE_COST_REVENUE] WARNING: Invalid Google Ads data structure! Proceeding with Revenue only.');
        }
      }
    }

    // If we reach here, we have valid data or fallback empty data
    if (googleAdsResultValue) {
      if (isMultiAccount) {
        const accountsData = (googleAdsResult.status === 'fulfilled' ? googleAdsResult.value : []) as any[];
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

        let successCount = 0;
        let failedAccounts: string[] = [];

        // The results are now in format: { data: { campaigns, ads }, message, ... }
        // BUT we converted from Map values, so we need to extract account_id from the data itself
        accountsData.forEach((accountResultWrapper: any) => {
          // accountResultWrapper is the result object from bulletproofAPI.getData
          // BUT if we attached accountId in the Promise.resolve step, it is at the top level
          const accData = accountResultWrapper.data || accountResultWrapper.result?.data || accountResultWrapper;

          // Try to extract account_id from the data itself, falling back to attached top-level ID
          const accountId = accountResultWrapper.accountId ||
            accData?.campaigns?.[0]?.customer_id ||
            accData?.ads?.[0]?.customer_id ||
            accData?.customer_id ||
            'unknown';

          if (accountId === 'unknown') {
            console.warn(`[ADSENSE_COST_REVENUE] Could not determine account ID from result`, accountResultWrapper);
            return;
          }

          if (accData?.campaigns || accData?.ads) {
            // Account succeeded - add to combined data with proper account_id tagging
            successCount++;
            if (accData?.campaigns) {
              accData.campaigns.forEach((c: any) => {
                c.account_id = accountId;
              });
              googleAdsData.campaigns.push(...accData.campaigns);
            }
            if (accData?.ads) {
              accData.ads.forEach((a: any) => {
                a.account_id = accountId;
              });
              googleAdsData.ads.push(...accData.ads);
            }

            const campaignCount = accData.campaigns?.length || 0;
            const adCount = accData.ads?.length || 0;
            console.log(`[ADSENSE_COST_REVENUE] Account ${accountId}: ${campaignCount} campaigns, ${adCount} ads tagged`);

            // Cost-completeness check: clicks > 0 with zero cost is impossible in a healthy
            // Google Ads response (CPC always charges for clicks), so we treat that as the
            // cost query having silently failed for this account. Skip caching so the next
            // load can retry, and surface the account in the response for the UI banner.
            // The symmetric ad-side guard is below (campaigns > 0 && ads == 0).
            let sumCost = 0;
            let sumClicks = 0;
            if (campaignCount > 0) {
              for (const c of accData.campaigns) {
                sumCost += c.metrics?.cost || 0;
                sumClicks += c.metrics?.clicks || 0;
              }
            }
            const costLooksBroken = campaignCount > 0 && sumClicks > 0 && sumCost === 0;

            // Only cache if ads are present (or account has no campaigns).
            // Accounts with campaigns but 0 ads had their ads query fail — caching would
            // permanently store broken data and return $0 revenue on every subsequent load.
            const adsLookBroken = campaignCount > 0 && adCount === 0;

            if (!adsLookBroken && !costLooksBroken) {
              cacheAccountData(accountId, { googleAdsData: accData });
            } else if (adsLookBroken) {
              console.warn(`[ADSENSE_COST_REVENUE] Account ${accountId}: skipping cache — ${campaignCount} campaigns but 0 ads (ads query likely failed)`);
            }

            if (costLooksBroken) {
              console.warn(`[ADSENSE_COST_REVENUE] Account ${accountId}: cost looks broken — ${sumClicks} clicks but $0 cost across ${campaignCount} campaigns. Skipping cache; flagging as partial.`);
              dq_partialCostAccountIds.push(accountId);
            }
          } else {
            // Account failed
            failedAccounts.push(accountId);
            console.warn(`[ADSENSE_COST_REVENUE]  Account ${accountId} returned no data`);
          }
        });

        message += `Google Ads: ${cachedCount} cached + ${successCount} fetched = ${cachedCount + successCount}/${accountIds.length} accounts, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads. `;
        console.log(`[ADSENSE_COST_REVENUE] Multi-account: ${cachedCount} cached + ${successCount} fetched, ${googleAdsData.campaigns.length} campaigns, ${googleAdsData.ads.length} ads`);

        if (failedAccounts.length > 0) {
          console.error(`[ADSENSE_COST_REVENUE]  PARTIAL DATA! ${failedAccounts.length}/${accountIds.length} accounts failed: ${failedAccounts.join(', ')}`);
          // Surface in API response so the UI can warn the user that cost is incomplete.
          dq_failedAccountIds.push(...failedAccounts);

          // CRITICAL: If more than 50% of accounts failed, return error instead of partial data
          const failureRate = failedAccounts.length / accountIds.length;
          if (failureRate > 0.5) {
            console.warn(`[ADSENSE_COST_REVENUE] WARNING: ${Math.round(failureRate * 100)}% of accounts failed! Proceeding with Revenue only.`);
          }

          message += `WARNING: ${failedAccounts.length}/${accountIds.length} accounts failed! Data incomplete. `;
        }
      } else {
        // Single account
        if (cachedAccountData.has(customerId)) {
          // Use cached data - CRITICAL: Tag with account_id to prevent mixing
          const cached = cachedAccountData.get(customerId);
          googleAdsData = cached?.googleAdsData || { campaigns: [], ads: [] };

          // Tag all campaigns and ads with account_id
          if (googleAdsData.campaigns) {
            googleAdsData.campaigns.forEach((c: any) => {
              c.account_id = customerId;
              // Validate customer_id matches if present
              if (c.customer_id && c.customer_id !== customerId) {
                console.warn(`[ADSENSE_COST_REVENUE]  Cached campaign customer_id mismatch: expected ${customerId}, got ${c.customer_id}`);
              }
            });
          }
          if (googleAdsData.ads) {
            googleAdsData.ads.forEach((a: any) => {
              a.account_id = customerId;
              // Validate customer_id matches if present
              if (a.customer_id && a.customer_id !== customerId) {
                console.warn(`[ADSENSE_COST_REVENUE]  Cached ad customer_id mismatch: expected ${customerId}, got ${a.customer_id}`);
              }
            });
          }

          message += `Google Ads: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads (cached). `;
          console.log(`[ADSENSE_COST_REVENUE] Single account ${customerId}: Using cached data with ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads (tagged)`);
        } else {
          // Use freshly fetched data
          const singleResult = googleAdsResult.status === 'fulfilled' ? googleAdsResult.value as any : undefined;

          if (singleResult && singleResult.data) {
            googleAdsData = singleResult.data;
          }

          // Tag all campaigns and ads with account_id
          if (googleAdsData?.campaigns) {
            googleAdsData.campaigns.forEach((c: any) => {
              c.account_id = customerId;
              if (c.customer_id && c.customer_id !== customerId) {
                console.warn(`[ADSENSE_COST_REVENUE]  Fresh campaign customer_id mismatch: expected ${customerId}, got ${c.customer_id}`);
              }
            });
          }
          if (googleAdsData?.ads) {
            googleAdsData.ads.forEach((a: any) => {
              a.account_id = customerId;
              if (a.customer_id && a.customer_id !== customerId) {
                console.warn(`[ADSENSE_COST_REVENUE]  Fresh ad customer_id mismatch: expected ${customerId}, got ${a.customer_id}`);
              }
            });
          }

          message += `Google Ads: ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads (fresh). `;
          console.log(`[ADSENSE_COST_REVENUE] Single account ${customerId}: Fetched ${googleAdsData?.campaigns?.length || 0} campaigns, ${googleAdsData?.ads?.length || 0} ads (tagged)`);

          // CRITICAL: Cache this account's data
          if (googleAdsData?.campaigns || googleAdsData?.ads) {
            cacheAccountData(customerId, { googleAdsData });
          }
        }
      }
    }

    // DEBUG: Log what customer IDs are actually in the Google Ads data
    console.log(`[ADSENSE_COST_REVENUE] ===== ACTUAL DATA VERIFICATION =====`);
    const uniqueCustomerIds = new Set<string>();
    if (googleAdsData?.campaigns) {
      googleAdsData.campaigns.forEach((c: any) => uniqueCustomerIds.add(c.customer_id || c.account_id || 'unknown'));
    }
    if (googleAdsData?.ads) {
      googleAdsData.ads.forEach((a: any) => uniqueCustomerIds.add(a.customer_id || a.account_id || 'unknown'));
    }
    console.log(`[ADSENSE_COST_REVENUE] Unique customer IDs in Google Ads data: ${Array.from(uniqueCustomerIds).join(', ')}`);
    console.log(`[ADSENSE_COST_REVENUE] Expected customer ID: ${customerId || 'all'}`);
    if (customerId && uniqueCustomerIds.size > 1) {
      console.error(`[ADSENSE_COST_REVENUE] WARNING: Expected single account but got ${uniqueCustomerIds.size} accounts!`);
    }

    // Handle AdSense data - Already validated above, so this must be fulfilled
    const adsenseData = adsenseRevenue.value as AdSenseRevenue[];

    // CRITICAL: Validate AdSense data is not empty
    if (!adsenseData || !Array.isArray(adsenseData)) {
      console.error('[ADSENSE_COST_REVENUE]  CRITICAL: AdSense data is invalid!');
      return NextResponse.json({
        error: 'Invalid AdSense data',
        message: 'AdSense API returned invalid data format',
        _loadTime: `${Date.now() - startTime}ms`
      }, { status: 503 });
    }

    // Log AdSense data summary
    message += `AdSense: ${adsenseData.length} records. `;

    if (adsenseData.length === 0) {
      console.warn('[ADSENSE_COST_REVENUE]  WARNING: AdSense returned 0 records for date range');
      message += ' No AdSense revenue data found. ';
    } else {
      const totalAdSenseRevenue = adsenseData.reduce((sum, r) => sum + r.earnings, 0);
      console.log(`[ADSENSE_COST_REVENUE] AdSense: ${adsenseData.length} records, Total: $${totalAdSenseRevenue.toFixed(2)}`);
      console.log(`[ADSENSE_COST_REVENUE] Sample AdSense records (first 3):`);
      adsenseData.slice(0, 3).forEach((r, idx) => {
        console.log(`  ${idx + 1}. Style: ${r.style_id}, Domain: ${r.domain_name}, Earnings: $${r.earnings}`);
      });
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
      let normalized = domain.replace(/^(search\.|www\.|m\.)/, '');

      // CRITICAL FIX: Treat all AFS domain variations as equivalent
      // This allows revenue mapping to work during domain migration
      if (normalized === 'termuxtools.com' || normalized === 'topresearchtopics.com') {
        normalized = 'topreserchtopics.com';
      }

      return normalized;
    };

    // Helper function to clean campaign names
    const cleanCampaignName = (name: string): string => {
      if (!name) return name;
      let cleaned = name
        .replace(/[-\s]?Ch\d+Xstyle\d+/gi, '')
        .replace(/[-\s]?style\d+/gi, '')
        .replace(/[-\s]+$/, '')
        .trim();

      return cleaned || name;
    };

    // Build campaign to ads mapping (URLs are in ads, not campaigns)
    // IMPORTANT: Process ALL ads to extract style_ids, regardless of campaign status
    const campaignToStyleMap = new Map<string, { styleIds: Set<string>; styleChannelMap: Map<string, string>; domains: Set<string>; campaignName: string; accountId: string; campaignStatus: string; country: string }>();

    // Track stats
    let totalAds = 0;
    let adsWithUrls = 0;
    let debugCount = 0; // For debug logging

    // Extract style_id and domain from ALL ads
    for (const ad of googleAdsData.ads || []) {
      totalAds++;
      const baseCampaignId = String(ad.campaign_id);
      const adCampaignStatus = String(ad.campaign_status || '').trim().toUpperCase();

      const finalUrls = ad.final_urls || [];
      if (finalUrls.length > 0) {
        adsWithUrls++;
      }

      // CRITICAL: Extract account_id with proper fallback chain
      // Priority: ad.account_id (we set this) > customer_id (from API) > customerId (request param)
      const accountId = ad.account_id || ad.customer_id || customerId || 'unknown';

      // CRITICAL FIX: Campaign IDs are NOT globally unique across accounts.
      // Use composite key to prevent campaigns from one account overwriting campaigns from another.
      const campaignKey = `${accountId}_${baseCampaignId}`;

      if (!campaignToStyleMap.has(campaignKey)) {
        // Get campaign name from campaigns data using either account-specific match or general match
        const campaign = (googleAdsData.campaigns || []).find((c: any) =>
          String(c.campaign_id) === baseCampaignId && (c.account_id === accountId || c.customer_id === accountId || (!c.account_id && !c.customer_id))
        );
        let campaignName = campaign?.campaign_name || campaign?.name || `Campaign ${baseCampaignId}`;

        // VALIDATION: Warn if account_id is unknown
        if (accountId === 'unknown') {
          console.warn(`[ADSENSE_COST_REVENUE]  WARNING: Campaign ${baseCampaignId} has unknown account_id! This will cause revenue misattribution.`);
        }

        const campaignStatus = campaign?.campaign_status || campaign?.status || adCampaignStatus || 'UNKNOWN';

        // Extract geo-targeting country from campaign data
        const geoTargets = campaign?.geo_targets as string[] | undefined;
        let country = '';
        let countrySource = 'none'; // Track where country came from

        // STEP 1: Try to get country from geo_targets (most accurate)
        if (geoTargets && geoTargets.length > 0) {
          const geoId = geoTargets[0];
          country = getCountryCodeFromGeoId(geoId, campaignName);
          if (country) {
            countrySource = 'geo_id';
          }
        }

        // STEP 2: FALLBACK - Extract 2-letter country code from campaign name
        if (!country) {
          countrySource = 'name';
          // 1. Check for exact 2-letter suffix like " - US", " - TH", " - NG", " EG"
          const countryMatch = campaignName.match(/(?:-|\s)\s*([A-Z]{2})(?:\s*#\d+)?$/i);
          if (countryMatch) {
            country = countryMatch[1].toUpperCase();
            if (country === 'TU') country = 'TR'; // Handle "TU" for Turkey
            if (country === 'UK') country = 'GB'; // Handle "UK" for Great Britain
          } else {
            // 2. Check for common country names or abbreviations in the string
            const lowerName = campaignName.toLowerCase();
            if (lowerName.includes('thai')) country = 'TH';
            else if (lowerName.includes('mexico')) country = 'MX';
            else if (lowerName.includes('viet') || lowerName.includes('vietnam')) country = 'VN';
            else if (lowerName.includes('indo')) country = 'ID';
            else if (lowerName.includes('india') || lowerName.match(/\b\s*in\s*(\b|#|$)/i)) country = 'IN';
            else if (lowerName.includes('singapore')) country = 'SG';
            else if (lowerName.includes('turk') || lowerName.includes('turkiye')) country = 'TR';
            else if (lowerName.includes('brazil')) country = 'BR';
            else if (lowerName.includes('egypt')) country = 'EG';
            else if (lowerName.includes('pakistan')) country = 'PK';
            else if (lowerName.includes('canada')) country = 'CA';
            else if (lowerName.includes('australia')) country = 'AU';
            else if (lowerName.includes('united states')) country = 'US';
          }
        }

        // CLEAN campaign name: Remove style_id patterns like "Ch64Xstyle1", "style123", etc.
        campaignName = cleanCampaignName(campaignName);

        // DEBUG: Log country source for first few campaigns
        if (debugCount < 5) {
          console.log(`[ADSENSE_COST_REVENUE] Campaign ${baseCampaignId}: country="${country}" (source: ${countrySource}), geo_targets=${JSON.stringify(geoTargets)}`);
          debugCount++;
        }

        campaignToStyleMap.set(campaignKey, {
          styleIds: new Set<string>(),
          styleChannelMap: new Map<string, string>(),
          domains: new Set<string>(),
          campaignName: campaignName,
          accountId: accountId,
          campaignStatus: String(campaignStatus).trim().toUpperCase(),
          country: country
        });
      }

      const mapping = campaignToStyleMap.get(campaignKey)!;

      for (const url of finalUrls) {
        const urlStyleId = extractStyleIdFromUrl(url);
        const urlChannelId = extractChannelIdFromUrl(url);
        let domain = extractDomainFromUrl(url);
        if (domain) domain = normalizeDomain(domain); // Normalize domain
        // For androidadvice, channel_id is the unique key (style_id is shared across
        // accounts). Store channel_id under the styleIds set so the rest of the pipeline,
        // which keys cost↔revenue by what it calls "style_id", actually joins on channel_id.
        // Leaving styleChannelMap unset means buildCompositeKey collapses to channel_id alone
        // — no composite-key apportionment is needed because channel_id is already unique.
        const matchKey = requiredFeedType === 'androidadvice' ? urlChannelId : urlStyleId;
        if (matchKey) {
          mapping.styleIds.add(matchKey);
          if (requiredFeedType !== 'androidadvice' && urlChannelId) {
            mapping.styleChannelMap.set(matchKey, urlChannelId);
          }
        }
        if (domain) mapping.domains.add(domain);
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Ad processing: ${totalAds} total ads, ${adsWithUrls} with URLs`);
    console.log(`[ADSENSE_COST_REVENUE] Extracted style_ids from ${campaignToStyleMap.size} campaigns (ALL statuses included)`);

    // DEBUG: Show which accounts the campaigns belong to
    const campaignAccountIds = new Set<string>();
    for (const [, data] of campaignToStyleMap.entries()) {
      campaignAccountIds.add(data.accountId);
    }
    console.log(`[ADSENSE_COST_REVENUE] Campaign accounts: ${Array.from(campaignAccountIds).join(', ')}`);
    console.log(`[ADSENSE_COST_REVENUE] Expected account: ${customerId || 'all'}`);
    if (customerId && campaignAccountIds.size > 1) {
      console.error(`[ADSENSE_COST_REVENUE] WARNING: Expected campaigns from 1 account, found ${campaignAccountIds.size} accounts!`);
    }

    // Debug: Show campaign status distribution
    const statusDistribution = new Map<string, number>();
    for (const [, data] of campaignToStyleMap.entries()) {
      const status = data.campaignStatus || 'UNKNOWN';
      statusDistribution.set(status, (statusDistribution.get(status) || 0) + 1);
    }
    console.log(`[ADSENSE_COST_REVENUE] Campaign status distribution:`, Object.fromEntries(statusDistribution));

    // Debug: Show sample style_id extractions (now with normalized domains)
    let styleDebugCount = 0;
    for (const [campaignId, data] of campaignToStyleMap.entries()) {
      if (styleDebugCount < 3 && data.styleIds.size > 0) {
        console.log(`[ADSENSE_COST_REVENUE] Campaign ${campaignId} (${data.campaignStatus}): styles=[${Array.from(data.styleIds).join(',')}], normalized_domains=[${Array.from(data.domains).join(',')}]`);
        styleDebugCount++;
      }
    }

    // Build composite-key (style_id|channel_id) -> campaign name and account mapping.
    // Channel_id disambiguates accounts that share a style_id (style_id alone is not unique
    // across accounts in some feeds). Falls back to style_id-only when the URL has no
    // channel_id (e.g. older feeds).
    // For androidadvice the match key has already been switched to channel_id (see URL
    // extraction loop above) — channel_id is unique for that feed so no compositing/
    // apportionment is needed; the composite key collapses to channel_id alone.
    const styleToCampaignName = new Map<string, { campaignName: string; accountId: string; styleId: string; channelId?: string }>();

    // Track composite keys (and bare style_ids) that belong to the current account scope
    const currentAccountStyleIds = new Set<string>();

    for (const [_campaignId, data] of campaignToStyleMap.entries()) {
      for (const styleId of data.styleIds) {
        const channelId = data.styleChannelMap.get(styleId);
        const compositeKey = buildCompositeKey(styleId, channelId);
        currentAccountStyleIds.add(compositeKey);
        // Also track bare style_id for fallback matching against revenue rows lacking channel_id
        currentAccountStyleIds.add(styleId);
        if (!styleToCampaignName.has(compositeKey)) {
          styleToCampaignName.set(compositeKey, {
            campaignName: data.campaignName,
            accountId: data.accountId,
            styleId,
            channelId,
          });
        }
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Built style_id to campaign name mapping for ${styleToCampaignName.size} unique style_ids`);
    console.log(`[ADSENSE_COST_REVENUE] Current account uses ${currentAccountStyleIds.size} unique style_ids: ${Array.from(currentAccountStyleIds).slice(0, 5).join(', ')}${currentAccountStyleIds.size > 5 ? '...' : ''}`);

    // DEBUG: Show which accounts are in the style map
    const styleMapAccountIds = new Set<string>();
    for (const [, data] of styleToCampaignName.entries()) {
      styleMapAccountIds.add(data.accountId);
    }
    console.log(`[ADSENSE_COST_REVENUE] Style map covers ${styleMapAccountIds.size} account(s): ${Array.from(styleMapAccountIds).join(', ')}`);
    if (customerId && styleMapAccountIds.size > 1) {
      console.error(`[ADSENSE_COST_REVENUE] WARNING: Style map should only have 1 account, found ${styleMapAccountIds.size}!`);
    }

    // WARNING: Check for potential style_id sharing across accounts
    // If viewing single account, this is expected. If viewing "All", this helps debug revenue duplication
    const accountContext = isMultiAccount ? `${accountIds.length} accounts combined` : `single account ${customerId}`;
    console.log(`[ADSENSE_COST_REVENUE] Context: ${accountContext}`);

    // Build cost lookup by style_id ONLY (SIMPLE AFS-STYLE MAPPING)
    // IMPORTANT: Include ALL campaigns with cost data, regardless of current status
    // Reason: A campaign might be PAUSED today but had costs yesterday - we need to count that historical cost
    const costByStyleId = new Map<string, { cost: number; clicks: number; impressions: number; conversions: number; cpa: number; campaignStatus: string }>();

    // Pre-fetch currency conversion rates for all unique account IDs in this request
    // This handles IDR accounts (CARHP, Predicto) so costs are stored in USD
    const uniqueAccountIds = new Set<string>();
    for (const [, data] of campaignToStyleMap.entries()) {
      if (data.accountId && data.accountId !== 'unknown') {
        uniqueAccountIds.add(data.accountId);
      }
    }
    const conversionRates = new Map<string, number>(); // accountId → USD conversion factor
    for (const accountId of uniqueAccountIds) {
      const currency = getAccountCurrency(accountId);
      if (currency !== 'USD') {
        const rate = await convertToUsd(1, currency);
        conversionRates.set(accountId, rate);
        console.log(`[CURRENCY] Account ${accountId}: 1 ${currency} = $${rate} USD`);
      } else {
        conversionRates.set(accountId, 1);
      }
    }

    // DEBUG: Track which dates are in the campaign data
    const campaignDates = new Set<string>();
    const campaignRowsByDate = new Map<string, number>();

    let totalCampaigns = 0;
    let campaignsWithCost = 0;
    let campaignsWithoutStyleId = 0;

    for (const campaign of googleAdsData.campaigns || []) {
      totalCampaigns++;
      const baseCampaignId = String(campaign.campaign_id);

      // CRITICAL: Extract account_id using the exact same fallback chain as ad processing
      const accountId = campaign.account_id || campaign.customer_id || customerId || 'unknown';
      const campaignKey = `${accountId}_${baseCampaignId}`;

      const urlData = campaignToStyleMap.get(campaignKey);

      // DEBUG: Track dates in the campaign data
      const segmentDate = campaign.segments?.date || campaign.date || 'no_date';
      campaignDates.add(segmentDate);
      campaignRowsByDate.set(segmentDate, (campaignRowsByDate.get(segmentDate) || 0) + 1);

      const rawCost = campaign.metrics?.cost || 0;
      const clicks = campaign.metrics?.clicks || 0;
      const impressions = campaign.metrics?.impressions || 0;
      const conversions = campaign.metrics?.conversions || 0;
      const campaignStatus = String(campaign.campaign_status || campaign.status || 'UNKNOWN').trim().toUpperCase();

      // Convert cost to USD if account uses non-USD currency (e.g. IDR for CARHP)
      const conversionRate = conversionRates.get(accountId) ?? 1;
      const cost = rawCost * conversionRate;

      // Skip campaigns without style_id mapping (no ads with URLs)
      if (!urlData || urlData.styleIds.size === 0) {
        campaignsWithoutStyleId++;
        if (cost > 0 || clicks > 0 || impressions > 0 || conversions > 0) {
          campaignsWithCost++;
          // Track unmapped cost under special composite key so it's not lost
          const unmappedKey = `unmapped_${accountId}_${baseCampaignId}`;
          if (!costByStyleId.has(unmappedKey)) {
            costByStyleId.set(unmappedKey, { cost: 0, clicks: 0, impressions: 0, conversions: 0, cpa: 0, campaignStatus });
            styleToCampaignName.set(unmappedKey, { campaignName: campaign.campaign_name || 'Unmapped Campaign', accountId, styleId: unmappedKey });
          }
          const existing = costByStyleId.get(unmappedKey)!;
          existing.cost += cost;
          existing.clicks += clicks;
          existing.impressions += impressions;
          existing.conversions += conversions;
          existing.cpa = existing.conversions > 0 ? existing.cost / existing.conversions : 0;
        }
        continue;
      }

      // Include ALL campaigns that have cost data in the date range, regardless of status
      if (cost > 0 || clicks > 0 || impressions > 0 || conversions > 0) {
        campaignsWithCost++;
      }

      // Add cost keyed by composite (style_id|channel_id) so accounts sharing a style_id
      // but using different channel_ids no longer cross-pollute each other's cost.
      for (const styleId of urlData.styleIds) {
        const channelId = urlData.styleChannelMap.get(styleId);
        const compositeKey = buildCompositeKey(styleId, channelId);
        if (!costByStyleId.has(compositeKey)) {
          costByStyleId.set(compositeKey, { cost: 0, clicks: 0, impressions: 0, conversions: 0, cpa: 0, campaignStatus: '' });
        }
        const existing = costByStyleId.get(compositeKey)!;
        existing.cost += cost;
        existing.clicks += clicks;
        existing.impressions += impressions;
        existing.conversions += conversions;
        existing.campaignStatus = campaignStatus; // Track status for debugging
        // Average CPA across multiple campaigns for the same style_id
        existing.cpa = existing.conversions > 0 ? existing.cost / existing.conversions : 0;
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Campaign cost processing: ${campaignsWithCost} campaigns with cost / ${totalCampaigns} total (${campaignsWithoutStyleId} without style_id)`);

    // Report unmapped geo IDs (helps identify missing mappings)
    if (unmappedGeoIds.size > 0) {
      console.warn(`[GEO_MAPPING]  ${unmappedGeoIds.size} unmapped geo target IDs encountered: ${Array.from(unmappedGeoIds).join(', ')}`);
      console.warn(`[GEO_MAPPING] These geo IDs should be added to the mapping or campaigns should include country codes in their names.`);
    } else {
      console.log(`[GEO_MAPPING] ✓ All geo target IDs successfully mapped to country codes`);
    }

    // DEBUG: Show date distribution
    console.log(`[ADSENSE_COST_REVENUE] Campaign data covers ${campaignDates.size} unique dates: ${Array.from(campaignDates).sort().join(', ')}`);
    console.log(`[ADSENSE_COST_REVENUE] Rows per date:`, Object.fromEntries(
      Array.from(campaignRowsByDate.entries()).sort((a, b) => a[0].localeCompare(b[0])) 
    ));
    console.log(`[ADSENSE_COST_REVENUE] Expected date range: ${startDate} to ${endDate}`); 

    // Calculate total conversions from Google Ads 
    const totalGoogleAdsConversions = Array.from(costByStyleId.values()).reduce((sum, data) => sum + data.conversions, 0);
    const totalGoogleAdsCost = Array.from(costByStyleId.values()).reduce((sum, data) => sum + data.cost, 0);
    console.log(`[ADSENSE_COST_REVENUE] Total Google Ads cost: $${totalGoogleAdsCost.toFixed(2)}, conversions: ${totalGoogleAdsConversions.toFixed(2)}`);

    // DEBUG: Show first 5 cost entries
    console.log(`[ADSENSE_COST_REVENUE] First 5 COST entries:`);
    let costEntryCount = 0;
    for (const [styleId, data] of costByStyleId.entries()) {
      if (costEntryCount < 5) {
        console.log(`  ${costEntryCount + 1}. style_id="${styleId}", cost=$${data.cost.toFixed(2)}, clicks=${data.clicks}, conversions=${data.conversions}`);
        costEntryCount++;
      }
    }

    // Debug: Show cost distribution by campaign status
    const costByStatus = new Map<string, { count: number; totalCost: number }>();
    for (const [, data] of costByStyleId.entries()) {
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

    console.log(`[ADSENSE_COST_REVENUE] Built cost lookup for ${costByStyleId.size} unique style_ids from ALL campaigns`);

    // ===== NEW GEOGRAPHIC_VIEW AGGREGATION LOGIC =====
    // Build simplified campaign → {style_id, domain} mapping for geographic_view processing
    // This enables O(n) single-pass aggregation by (domain + style_id + geo_id)
    const campaignToStyleDomainMap = new Map<string, { styleId: string; domain: string; accountId: string; campaignName: string }>();

    for (const [campaignKey, data] of campaignToStyleMap.entries()) {
      const firstStyleId = Array.from(data.styleIds)[0];
      const firstDomain = Array.from(data.domains)[0];

      if (firstStyleId && firstDomain) {
        campaignToStyleDomainMap.set(campaignKey, {
          styleId: firstStyleId,
          domain: firstDomain,
          accountId: data.accountId,
          campaignName: data.campaignName
        });
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] Built campaign → style_id/domain map for ${campaignToStyleDomainMap.size} campaigns`);

    // FEATURE FLAG: Enable/disable geographic_view approach
    // Set to false until conversion values are configured in Google Ads
    const ENABLE_GEOGRAPHIC_VIEW = false;

    // Process geographic_view data if available (NEW APPROACH)
    // CRITICAL: Only use if we have actual revenue data (conversions_value > 0)
    let totalGeoViewRevenue = 0;
    if (googleAdsData.geographic_views && googleAdsData.geographic_views.length > 0) {
      totalGeoViewRevenue = googleAdsData.geographic_views.reduce((sum: number, gv: any) => sum + (gv.metrics?.conversions_value || 0), 0);
    }

    const useGeographicView = ENABLE_GEOGRAPHIC_VIEW &&
      googleAdsData.geographic_views &&
      googleAdsData.geographic_views.length > 0 &&
      totalGeoViewRevenue > 0;

    console.log(`[ADSENSE_COST_REVENUE] Geographic view check: ${googleAdsData.geographic_views?.length || 0} records, $${totalGeoViewRevenue.toFixed(2)} total revenue, enabled=${ENABLE_GEOGRAPHIC_VIEW}`);

    if (useGeographicView) {
      console.log(`[ADSENSE_COST_REVENUE] ===== USING GEOGRAPHIC_VIEW DATA (NEW APPROACH) =====`);
      console.log(`[ADSENSE_COST_REVENUE] Geographic view records: ${googleAdsData.geographic_views!.length}`);

      // Single-pass aggregation by (domain + style_id + geo_id)
      const revenueByDomainStyleGeo = new Map<string, {
        domain: string;
        style_id: string;
        geo_id: number;
        revenue: number;
        conversions: number;
        clicks: number;
        impressions: number;
        cost: number;
        account_id: string;
        campaign_name: string;
      }>();

      let processedRecords = 0;
      let skippedRecords = 0;

      for (const geoView of googleAdsData.geographic_views!) {
        const campaignId = geoView.campaign_id;
        const accountId = geoView.customer_id;
        const campaignKey = `${accountId}_${campaignId}`;

        // Lookup campaign to get style_id and domain
        const mapping = campaignToStyleDomainMap.get(campaignKey);

        if (!mapping) {
          skippedRecords++;
          if (skippedRecords <= 10) {
            console.log(`[ADSENSE_COST_REVENUE] SKIP GEO_VIEW: campaign ${campaignId} not found in mapping`);
          }
          continue;
        }

        const { styleId, domain, campaignName } = mapping;
        const geoId = geoView.geo_id;
        const revenue = geoView.metrics.conversions_value;

        // Aggregate by (domain + style_id + geo_id)
        const key = `${styleId}_${geoId}`;

        if (!revenueByDomainStyleGeo.has(key)) {
          revenueByDomainStyleGeo.set(key, {
            domain: domain,
            style_id: styleId,
            geo_id: geoId,
            revenue: 0,
            conversions: 0,
            clicks: 0,
            impressions: 0,
            cost: 0,
            account_id: accountId,
            campaign_name: campaignName
          });
        }

        const entry = revenueByDomainStyleGeo.get(key)!;
        entry.revenue += revenue;
        entry.conversions += geoView.metrics.conversions;
        entry.clicks += geoView.metrics.clicks;
        entry.impressions += geoView.metrics.impressions;
        entry.cost += geoView.metrics.cost;

        processedRecords++;
      }

      console.log(`[ADSENSE_COST_REVENUE] Geo view processing: ${processedRecords} processed, ${skippedRecords} skipped`);
      console.log(`[ADSENSE_COST_REVENUE] Created ${revenueByDomainStyleGeo.size} unique (domain + style_id + geo_id) aggregations`);

      // Convert to output format
      const campaign_aggregated = Array.from(revenueByDomainStyleGeo.values()).map(entry => ({
        account_id: entry.account_id,
        campaign_id: entry.style_id,
        campaign_name: entry.campaign_name,
        style_id: entry.style_id,
        domain: entry.domain,
        country: `GEO_${entry.geo_id}`, // Geo ID instead of country code
        article: 'N/A',
        cost: entry.cost,
        revenue: entry.revenue,
        profit: entry.revenue - entry.cost,
        clicks: entry.clicks,
        impressions: entry.impressions,
        conversions: entry.conversions,
        costClicks: entry.clicks,
        cpa: entry.conversions > 0 ? entry.cost / entry.conversions : 0,
        rpc: entry.clicks > 0 ? entry.revenue / entry.clicks : 0,
        roi: entry.cost > 0 ? ((entry.revenue - entry.cost) / entry.cost) * 100 : 0,
        roas: entry.cost > 0 ? entry.revenue / entry.cost : 0
      })).sort((a, b) => b.revenue - a.revenue);

      console.log(`[ADSENSE_COST_REVENUE] Sample geo view results (first 3):`);
      campaign_aggregated.slice(0, 3).forEach((entry, idx) => {
        console.log(`  ${idx + 1}. Domain: ${entry.domain}, Style: ${entry.style_id}, Geo: ${entry.country}, Revenue: $${entry.revenue.toFixed(2)}, Cost: $${entry.cost.toFixed(2)}`);
      });

      // Return early with geographic_view results
      const totalRevenue = campaign_aggregated.reduce((sum, c) => sum + c.revenue, 0);
      const totalCost = campaign_aggregated.reduce((sum, c) => sum + c.cost, 0);
      const totalProfit = totalRevenue - totalCost;

      const responseData = {
        campaign_aggregated,
        account_level_aggregated: [],
        summary: {
          totalCost,
          totalRevenue,
          totalProfit,
          totalConversions: campaign_aggregated.reduce((sum, c) => sum + c.conversions, 0),
          roi: totalCost > 0 ? ((totalProfit / totalCost) * 100) : 0,
          roas: totalCost > 0 ? (totalRevenue / totalCost) : 0,
          overallCpa: campaign_aggregated.reduce((sum, c) => sum + c.conversions, 0) > 0
            ? totalCost / campaign_aggregated.reduce((sum, c) => sum + c.conversions, 0)
            : 0
        },
        _loadTime: `${Date.now() - startTime}ms`,
        _source: 'geographic_view',
        _message: 'Using new geographic_view aggregation (domain + style_id + geo_id)'
      };

      // Cache the result
      try {
        await redisCacheManager.set(aggregatedCacheKey, responseData, {
          dataType: 'unified',
          ttl: AGGREGATED_CACHE_TTL
        });
        console.log(`[ADSENSE_COST_REVENUE] Cached geographic_view results to: ${aggregatedCacheKey}`);
      } catch (err) {
        console.warn('[ADSENSE_COST_REVENUE] Failed to cache geographic_view results:', err);
      }

      return NextResponse.json(responseData);
    }

    // ===== FALLBACK TO ADSENSE DATA (OLD APPROACH) =====
    console.log(`[ADSENSE_COST_REVENUE] Geographic view data not available, falling back to AdSense data`);

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

    // Build revenue map keyed by composite (style_id|channel_id). For style_ids shared
    // across multiple accounts (different channel_ids in their URLs), AdSense gives one
    // revenue total per style_id; we apportion it across the colliding composite keys
    // in proportion to each key's Google Ads cost.
    const revenueByStyleDomain = new Map<string, any>();

    // Unattributed revenue: AdSense rows whose domain passes the allowlist but whose
    // style_id isn't used by any current Google Ads campaign in this request. Surfaced
    // in the response (admin-only display) so users can see organic/external income
    // on the feed's domain without inflating any campaign's attributed revenue.
    const unattributedByStyleId = new Map<string, { revenue: number; clicks: number }>();

    // Build bare-style_id -> [composite keys] index from cost map (covers all keys we
    // actually have cost or campaign data for). Used to apportion revenue.
    const styleIdToCompositeKeys = new Map<string, string[]>();
    for (const compositeKey of styleToCampaignName.keys()) {
      const mapping = styleToCampaignName.get(compositeKey)!;
      const bare = mapping.styleId;
      const list = styleIdToCompositeKeys.get(bare);
      if (list) {
        if (!list.includes(compositeKey)) list.push(compositeKey);
      } else {
        styleIdToCompositeKeys.set(bare, [compositeKey]);
      }
    }

    let totalRevenueItems = 0;
    let allocatedRevenueItems = 0;
    let skippedRevenueItems = 0;
    let totalRevenueValue = 0;
    let allocatedRevenueValue = 0;
    let skippedRevenueValue = 0;

    // Domain allowlist: only accept AdSense revenue from the feed's own domain.
    const FEED_ALLOWED_DOMAINS: Partial<Record<FeedType, string[]>> = {
      thefactrelay: ['thefactrelay.com'],
      carhp: ['carhp.com', 'search.carhp.com'],
      androidadvice: ['androidadvices.com'],
    };
    const allowedDomains = FEED_ALLOWED_DOMAINS[requiredFeedType as FeedType] ?? null;

    const ensureEntry = (key: string, styleId: string, rev: AdSenseRevenue) => {
      if (revenueByStyleDomain.has(key)) return revenueByStyleDomain.get(key)!;
      const mapping = styleToCampaignName.get(key);
      const campaignName = mapping?.campaignName || `Style ${styleId}`;
      const accountId = mapping?.accountId || 'unknown';
      const adsenseCountryRaw = rev.country_name || 'unknown';
      const countryCode = adsenseCountryRaw !== 'unknown' ? getCountryCode(adsenseCountryRaw) : '';
      const entry = {
        account_id: accountId,
        campaign_id: styleId,
        campaign_name: campaignName,
        style_id: styleId,
        domain: rev.domain_name || 'N/A',
        country: countryCode,
        article: 'N/A',
        cost: 0,
        revenue: 0,
        profit: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        costClicks: 0,
        cpa: 0,
        rpc: 0,
        roi: 0,
        roas: 0,
      };
      revenueByStyleDomain.set(key, entry);
      return entry;
    };

    for (const rev of adsenseData) {
      totalRevenueItems++;
      totalRevenueValue += rev.earnings;

      // Domain filter
      // For androidadvice we cannot ask AdSense for both channel_id and domain in a single
      // call, and the publisher account also earns from unrelated domains. Instead we
      // accept only channels that appear in androidadvice cost URLs — per the configured
      // setup, every channel_id is unique to a single domain, so a channel that shows up
      // in androidadvice Google Ads is guaranteed to be on androidadvices.com. Channels
      // not in the cost set (e.g. queryvaults.com) are dropped here, not counted as
      // unattributed.
      if (requiredFeedType === 'androidadvice') {
        if (!currentAccountStyleIds.has(rev.style_id)) {
          skippedRevenueItems++;
          skippedRevenueValue += rev.earnings;
          if (skippedRevenueItems <= 20) {
            console.log(`[ADSENSE_COST_REVENUE] DROPPED #${skippedRevenueItems}: channel_id=${rev.style_id}, earnings=$${rev.earnings.toFixed(2)}, reason=channel not in any androidadvice cost URL (likely a different publisher product)`);
          }
          continue;
        }
      } else if (allowedDomains) {
        const revDomain = (rev.domain_name || '').toLowerCase();
        const domainAllowed = allowedDomains.some(d => revDomain === d || revDomain.endsWith('.' + d));
        if (!domainAllowed) {
          skippedRevenueItems++;
          skippedRevenueValue += rev.earnings;
          if (skippedRevenueItems <= 20) {
            console.log(`[ADSENSE_COST_REVENUE] SKIPPED #${skippedRevenueItems}: style=${rev.style_id}, domain=${rev.domain_name}, earnings=$${rev.earnings.toFixed(2)}, reason=domain not allowed for ${requiredFeedType}`);
          }
          continue;
        }
      }

      const styleId = rev.style_id;
      const compositeKeys = styleIdToCompositeKeys.get(styleId);

      // Style_id not in any of our campaigns — skip (but track as unattributed since
      // the domain already passed the allowlist, so this is real revenue on our feed's
      // domain that just doesn't have a campaign to attach to).
      if (!compositeKeys || compositeKeys.length === 0) {
        if (!currentAccountStyleIds.has(styleId)) {
          skippedRevenueItems++;
          skippedRevenueValue += rev.earnings;
          const u = unattributedByStyleId.get(styleId) || { revenue: 0, clicks: 0 };
          u.revenue += rev.earnings;
          u.clicks += rev.clicks;
          unattributedByStyleId.set(styleId, u);
          if (skippedRevenueItems <= 20) {
            console.log(`[ADSENSE_COST_REVENUE] UNATTRIBUTED #${skippedRevenueItems}: style=${styleId}, earnings=$${rev.earnings.toFixed(2)}, reason=style_id not in any account campaign`);
          }
          continue;
        }
        // Bare style_id matched currentAccountStyleIds but no composite — store under bare key
        const entry = ensureEntry(styleId, styleId, rev);
        entry.revenue += rev.earnings;
        entry.clicks += rev.clicks;
        allocatedRevenueItems++;
        allocatedRevenueValue += rev.earnings;
        continue;
      }

      // Apportion revenue across colliding composite keys by Google Ads cost ratio.
      // Single-key (most common): full amount goes to that one key. Multi-key (collision):
      // split by cost share; if all keys have $0 cost, split evenly.
      let totalCostForStyle = 0;
      for (const ck of compositeKeys) {
        totalCostForStyle += costByStyleId.get(ck)?.cost ?? 0;
      }

      for (const ck of compositeKeys) {
        const keyCost = costByStyleId.get(ck)?.cost ?? 0;
        const share = totalCostForStyle > 0
          ? keyCost / totalCostForStyle
          : 1 / compositeKeys.length;
        const apportionedRevenue = rev.earnings * share;
        const apportionedClicks = rev.clicks * share;

        const entry = ensureEntry(ck, styleId, rev);
        entry.revenue += apportionedRevenue;
        entry.clicks += apportionedClicks;
      }

      allocatedRevenueItems++;
      allocatedRevenueValue += rev.earnings;

      if (allocatedRevenueItems <= 5) {
        const splitLabel = compositeKeys.length > 1
          ? `split ${compositeKeys.length}-ways by cost ratio`
          : 'single';
        console.log(`[ADSENSE_COST_REVENUE] ALLOCATED #${allocatedRevenueItems}: style=${styleId} → ${splitLabel}, earnings=$${rev.earnings.toFixed(2)}`);
      }
    }

    console.log(`[ADSENSE_COST_REVENUE] ===== REVENUE ALLOCATION SUMMARY =====`);
    console.log(`[ADSENSE_COST_REVENUE] Total Revenue: ${totalRevenueItems} items, $${totalRevenueValue.toFixed(2)}`);
    console.log(`[ADSENSE_COST_REVENUE] Allocated: ${allocatedRevenueItems} items, $${allocatedRevenueValue.toFixed(2)} (${(allocatedRevenueValue / totalRevenueValue * 100).toFixed(1)}%)`);
    console.log(`[ADSENSE_COST_REVENUE] Skipped: ${skippedRevenueItems} items, $${skippedRevenueValue.toFixed(2)} (${(skippedRevenueValue / totalRevenueValue * 100).toFixed(1)}%)`);
    if (skippedRevenueValue > 5) {
      console.warn(`[ADSENSE_COST_REVENUE] ⚠️ WARNING: $${skippedRevenueValue.toFixed(2)} revenue not mapped (likely from other accounts' style_ids)`);
    } else {
      console.log(`[ADSENSE_COST_REVENUE] ✓ Revenue allocation successful - less than $5 unmapped`);
    }

    // Diagnostic: Find unmapped (style|channel) pairs
    const unmappedStyleIds = new Map<string, number>();
    for (const rev of adsenseData) {
      const compositeKey = buildCompositeKey(rev.style_id, rev.channel_id);
      const known =
        styleToCampaignName.has(compositeKey) ||
        styleToCampaignName.has(rev.style_id) ||
        currentAccountStyleIds.has(compositeKey) ||
        currentAccountStyleIds.has(rev.style_id);
      if (!known) {
        unmappedStyleIds.set(compositeKey, (unmappedStyleIds.get(compositeKey) || 0) + rev.earnings);
      }
    }

    if (unmappedStyleIds.size > 0) {
      const totalUnmapped = Array.from(unmappedStyleIds.values()).reduce((sum, val) => sum + val, 0);
      if (totalUnmapped > 5) {
        console.warn(`[ADSENSE_COST_REVENUE] ⚠️ $${totalUnmapped.toFixed(2)} revenue from ${unmappedStyleIds.size} unmapped style_ids`);
        const sortedMissing = Array.from(unmappedStyleIds.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);
        sortedMissing.forEach(([styleId, earnings]) => {
          console.log(`[ADSENSE_COST_REVENUE]   style_id=${styleId}: $${earnings.toFixed(2)}`);
        });
      }
    }
    console.log(`[ADSENSE_COST_REVENUE] Processing revenue for ${revenueByStyleDomain.size} unique style_ids`);

    // DEBUG: Show first 5 revenue entries that were allocated
    console.log(`[ADSENSE_COST_REVENUE] First 5 REVENUE entries (allocated):`);
    let revenueEntryCount = 0;
    for (const [_key, data] of revenueByStyleDomain.entries()) {
      if (revenueEntryCount < 5) {
        console.log(`  ${revenueEntryCount + 1}. style_id="${data.style_id}", domain="${data.domain}", revenue=$${data.revenue.toFixed(2)}, clicks=${data.clicks}`);
        revenueEntryCount++;
      }
    }

    // DEBUG: Check for cost entries that have NO matching revenue
    console.log(`[ADSENSE_COST_REVENUE]  Checking for COST entries with NO revenue:`);
    let noRevenueCount = 0;
    let noRevenueTotalCost = 0;
    for (const [styleId, costData] of costByStyleId.entries()) {
      const revenueData = revenueByStyleDomain.get(styleId);
      if (!revenueData || revenueData.revenue === 0) {
        if (noRevenueCount < 10) {
          console.log(`  ${noRevenueCount + 1}. style_id="${styleId}", cost=$${costData.cost.toFixed(2)} - NO REVENUE`);
        }
        noRevenueCount++;
        noRevenueTotalCost += costData.cost;
      }
    }
    console.log(`[ADSENSE_COST_REVENUE] Total: ${noRevenueCount} cost entries with NO revenue, total cost: $${noRevenueTotalCost.toFixed(2)}`);

    // Extract article information from Google Ads campaign URLs
    console.log(`[ADSENSE_COST_REVENUE] Extracting article names from campaign URLs...`);
    for (const ad of googleAdsData.ads || []) {
      const finalUrls = ad.final_urls || [];

      for (const url of finalUrls) {
        const urlStyleId = extractStyleIdFromUrl(url);
        const urlChannelId = extractChannelIdFromUrl(url);
        const article = extractArticleFromUrl(url);

        // androidadvice: match key is channel_id alone. Other feeds: composite (style|channel)
        // with bare style_id fallback for older URL formats.
        const matchKey = requiredFeedType === 'androidadvice' ? urlChannelId : urlStyleId;
        if (matchKey) {
          const compositeKey = requiredFeedType === 'androidadvice'
            ? matchKey
            : buildCompositeKey(urlStyleId!, urlChannelId);
          const existing = revenueByStyleDomain.get(compositeKey) ?? revenueByStyleDomain.get(matchKey);
          if (existing && article !== 'N/A') {
            if (existing.article === 'N/A') {
              existing.article = article;
            }
          }
        }
      }
    }

    // Add cost data where available
    let matchedCost = 0;
    let unmatchedCost = 0;

    // Note: costByStyleId is keyed by composite (style|channel) or bare style_id for older
    // feeds. revenueByStyleDomain is keyed the same way, so a direct lookup works.
    for (const [key, costData] of costByStyleId.entries()) {
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
        // Cost exists but no revenue - create entry with cost-only data
        const mapping = styleToCampaignName.get(key);
        const campaignName = mapping?.campaignName || `Style ${key}`;
        const accountId = mapping?.accountId || 'unknown';
        const displayStyleId = mapping?.styleId || key; // bare style_id for UI display

        revenueByStyleDomain.set(key, {
          account_id: accountId,
          campaign_name: campaignName,
          style_id: displayStyleId,
          domain: 'N/A',
          country: '',
          article: 'N/A',
          cost: costData.cost,
          revenue: 0,
          profit: -costData.cost,
          clicks: 0,
          costClicks: costData.clicks,
          impressions: costData.impressions,
          conversions: costData.conversions,
          cpa: costData.cpa,
          rpc: 0,
          roi: -100,
          roas: 0,
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
          campaignCount: 0,
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

    // DIAGNOSTIC: Show account-level cost breakdown
    console.log(`[ACCOUNT_AGGREGATION] Account-level breakdown:`);
    for (const [accountId, data] of accountAggregationMap.entries()) {
      console.log(`  Account ${accountId}: $${data.cost.toFixed(2)} cost, $${data.revenue.toFixed(2)} revenue, ${data.conversions} conversions, ${data.campaignCount} campaigns`);
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

    // FINAL VALIDATION: Check for entries with unknown account_id
    const entriesWithUnknownAccount = campaign_aggregated.filter(c => c.account_id === 'unknown');
    if (entriesWithUnknownAccount.length > 0) {
      console.error(`[ADSENSE_COST_REVENUE] VALIDATION ERROR: ${entriesWithUnknownAccount.length} entries have unknown account_id`);
      entriesWithUnknownAccount.slice(0, 5).forEach((entry, idx) => {
        console.error(`  ${idx + 1}. Campaign: ${entry.campaign_name}, Style: ${entry.style_id}, Cost: $${entry.cost.toFixed(2)}, Revenue: $${entry.revenue.toFixed(2)}`);
      });
    }

    // VALIDATION: Verify requested accounts match returned data
    const returnedAccountIds = new Set(account_level_aggregated.map(a => a.account_id));
    const missingAccounts = requestedAccountIds.filter(id => !returnedAccountIds.has(id));
    if (missingAccounts.length > 0) {
      console.warn(`[ADSENSE_COST_REVENUE]  WARNING: ${missingAccounts.length} requested accounts have no data: ${missingAccounts.join(', ')}`);
    }

    console.log(`[ADSENSE_COST_REVENUE] VALIDATION COMPLETE: ${account_level_aggregated.length} accounts, ${campaign_aggregated.length} campaigns`);

    // CRITICAL: Final data isolation filter - Remove any entries not belonging to requested accounts
    const requestedAccountSet = new Set(requestedAccountIds);
    const originalCampaignCount = campaign_aggregated.length;
    const originalAccountCount = account_level_aggregated.length;

    // Filter campaign_aggregated to only include requested accounts
    const filteredCampaignAggregated = campaign_aggregated.filter((entry: any) => {
      const belongsToRequested = requestedAccountSet.has(entry.account_id);
      if (!belongsToRequested && entry.account_id !== 'unknown') {
        console.warn(`[ADSENSE_COST_REVENUE]  FILTERED OUT: Campaign ${entry.campaign_name} belongs to ${entry.account_id}, not in requested accounts`);
      }
      return belongsToRequested;
    });

    // Filter account_level_aggregated to only include requested accounts
    const filteredAccountLevelAggregated = account_level_aggregated.filter((account: any) => {
      const belongsToRequested = requestedAccountSet.has(account.account_id);
      if (!belongsToRequested && account.account_id !== 'unknown') {
        console.warn(`[ADSENSE_COST_REVENUE]  FILTERED OUT: Account ${account.account_id} not in requested accounts`);
      }
      return belongsToRequested;
    });

    const filteredCampaignCount = filteredCampaignAggregated.length;
    const filteredAccountCount = filteredAccountLevelAggregated.length;

    if (originalCampaignCount !== filteredCampaignCount) {
      console.error(`[ADSENSE_COST_REVENUE] DATA MIXING DETECTED: Filtered out ${originalCampaignCount - filteredCampaignCount} campaigns from other accounts!`);
    }
    if (originalAccountCount !== filteredAccountCount) {
      console.error(`[ADSENSE_COST_REVENUE] DATA MIXING DETECTED: Filtered out ${originalAccountCount - filteredAccountCount} accounts from other accounts!`);
    }

    console.log(`[ADSENSE_COST_REVENUE] DATA ISOLATION: Campaigns ${filteredCampaignCount}/${originalCampaignCount}, Accounts ${filteredAccountCount}/${originalAccountCount}`);

    // Recalculate summary with filtered data
    const filteredTotalCost = filteredCampaignAggregated.reduce((sum: number, c: any) => sum + c.cost, 0);
    
    const filteredTotalRevenue = filteredCampaignAggregated.reduce((sum: number, c: any) => sum + c.revenue, 0);
    const filteredTotalProfit = filteredTotalRevenue - filteredTotalCost;
    const filteredTotalConversions = filteredCampaignAggregated.reduce((sum: number, c: any) => sum + c.conversions, 0);

    // CRITICAL: Data quality validation before returning/caching
    // Check if the data makes sense - if we have campaigns but 0 cost, something is wrong
    const hasCampaigns = (googleAdsData?.campaigns?.length || 0) > 0;
    const hasAds = (googleAdsData?.ads?.length || 0) > 0;
    const hasAnyCost = filteredTotalCost > 0;
    const hasAnyRevenue = filteredTotalRevenue > 0;

    console.log(`[ADSENSE_COST_REVENUE] ===== DATA QUALITY CHECK =====`);
    console.log(`[ADSENSE_COST_REVENUE] Has campaigns: ${hasCampaigns} (${googleAdsData?.campaigns?.length || 0} campaigns)`);
    console.log(`[ADSENSE_COST_REVENUE] Has ads: ${hasAds} (${googleAdsData?.ads?.length || 0} ads)`);
    console.log(`[ADSENSE_COST_REVENUE] Has cost: ${hasAnyCost} ($${filteredTotalCost.toFixed(2)})`);
    console.log(`[ADSENSE_COST_REVENUE] Has revenue: ${hasAnyRevenue} ($${filteredTotalRevenue.toFixed(2)})`);

    // WARNING: If we have campaigns but NO cost or NO ads, the data is likely incomplete
    if (hasCampaigns && (!hasAnyCost || !hasAds)) {
      console.error(`[ADSENSE_COST_REVENUE]  DATA QUALITY WARNING: ${googleAdsData.campaigns.length} campaigns but cost=$${filteredTotalCost} or ads=${googleAdsData.ads?.length || 0}`);
      console.error(`[ADSENSE_COST_REVENUE] This indicates incomplete/corrupted data - NOT caching this response!`);

      // IMPORTANT: Return the data but with warnings - do NOT cache it
      return NextResponse.json({
        success: false,
        warning: 'Data quality issue detected',
        message: `Found ${googleAdsData.campaigns.length} campaigns but ${hasAnyCost ? 'ads are missing' : 'cost is $0'}. Data may be incomplete.`,
        account: adsenseAccountId,
        dateRange: { startDate, endDate },
        dataQualityIssues: {
          hasCampaigns,
          hasAds,
          hasAnyCost,
          hasAnyRevenue,
          campaignCount: googleAdsData?.campaigns?.length || 0,
          adCount: googleAdsData?.ads?.length || 0,
          totalCost: filteredTotalCost,
          totalRevenue: filteredTotalRevenue
        },
        _loadTime: `${Date.now() - startTime}ms`,
        _notCached: true,
        _recommendation: 'Try forcing a refresh or check API credentials'
      }, {
        status: 200, // Return 200 but with success:false to indicate data issue
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Data-Quality': 'degraded'
        }
      });
    }

    // Build unattributed revenue payload (revenue on the feed's domain whose style_ids
    // don't match any current Google Ads campaign — usually direct/organic/external traffic).
    let unattributedItems = Array.from(unattributedByStyleId.entries())
      .map(([style_id, v]) => ({ style_id, revenue: v.revenue, clicks: v.clicks }))
      .sort((a, b) => b.revenue - a.revenue);
    let unattributedTotal = unattributedItems.reduce((s, x) => s + x.revenue, 0);
    let unattributedClicks = unattributedItems.reduce((s, x) => s + x.clicks, 0);

    // For androidadvice we can't break unattributed down per-channel: the AdSense
    // channel_id report doesn't tell us which channels are on androidadvices.com vs the
    // publisher's other domains (queryvaults etc.). The domain-name report does give us
    // the androidadvices.com total though, so we surface the gap (domain total −
    // attributed-to-campaigns) as an aggregate unattributed line. Only meaningful in the
    // multi-account / All-Accounts view since the domain total spans every AA account.
    if (isAndroidadvice && requestedAccountIds.length > 1 && androidadviceDomainTotal > 0) {
      const attributed = filteredCampaignAggregated.reduce((s: number, c: any) => s + (c.revenue || 0), 0);
      const gap = androidadviceDomainTotal - attributed;
      console.log(`[ADSENSE_COST_REVENUE] androidadvice — domain(all-accounts)=$${androidadviceDomainTotal.toFixed(2)}, attributed(this view)=$${attributed.toFixed(2)}, unattributed=$${gap.toFixed(2)}`);
      if (gap > 0) {
        unattributedTotal = gap;
        unattributedClicks = 0;
        unattributedItems = [];
      }
    }

    // Deduplicate the data-quality buckets — an account could land in both lists across
    // retries (e.g. failed on first batch, partial-cost on the retry).
    const dq_failedUnique = Array.from(new Set(dq_failedAccountIds));
    const dq_partialCostUnique = Array.from(new Set(dq_partialCostAccountIds));
    const dq_partial = dq_failedUnique.length > 0 || dq_partialCostUnique.length > 0;

    const response = {
      success: true,
      account: adsenseAccountId,
      dateRange: { startDate, endDate },
      google_ads_data: { campaigns: googleAdsData.campaigns || [], total: (googleAdsData.campaigns || []).length },
      adsense_data: { revenues: adsenseData, total: adsenseData.length },
      campaign_aggregated: filteredCampaignAggregated,
      account_level_aggregated: filteredAccountLevelAggregated,
      data_quality: {
        partial: dq_partial,
        total_accounts_requested: requestedAccountIds.length,
        failed_account_ids: dq_failedUnique,
        partial_cost_account_ids: dq_partialCostUnique,
      },
      unattributed_revenue: {
        total: unattributedTotal,
        clicks: unattributedClicks,
        styleIdCount: unattributedItems.length,
        items: unattributedItems,
      },
      summary: {
        totalCost: filteredTotalCost,
        totalRevenue: filteredTotalRevenue,
        totalProfit: filteredTotalProfit,
        totalClicks,
        totalImpressions,
        totalConversions: filteredTotalConversions,
        overallROI: filteredTotalCost > 0 ? (filteredTotalProfit / filteredTotalCost) * 100 : 0,
        overallROAS: filteredTotalCost > 0 ? filteredTotalRevenue / filteredTotalCost : 0,
        profitableCampaigns: filteredCampaignAggregated.filter((c: any) => c.profit > 0).length,
        totalCampaigns: filteredCampaignAggregated.length,
        profitabilityRate: filteredCampaignAggregated.length > 0 ? (filteredCampaignAggregated.filter((c: any) => c.profit > 0).length / filteredCampaignAggregated.length) * 100 : 0,
        uniqueStyleIds: uniqueStyleIds.size,
        uniqueDomains: uniqueDomains.size,
        uniqueCountries: uniqueCountries.size,
        totalAccounts: filteredAccountLevelAggregated.length,
        profitableAccounts: filteredAccountLevelAggregated.filter((a: any) => a.profit > 0).length,
        dataIsolation: {
          requestedAccounts: requestedAccountIds.length,
          returnedAccounts: filteredAccountCount,
          filteredOutCampaigns: originalCampaignCount - filteredCampaignCount,
          filteredOutAccounts: originalAccountCount - filteredAccountCount
        }
      },
      _source: 'adsense_cost_revenue_mapped',
      _timestamp: new Date().toISOString(),
      _fetchTime: `${fetchTime}ms`,
      _loadTime: `${Date.now() - startTime}ms`,
      _message: message.trim(),
      _dataQualityPassed: true
    };

    // CRITICAL: Only cache if data quality is good
    // Next request will get this exact same data until cache expires
    try {
      await redisCacheManager.set(aggregatedCacheKey, response, {
        ttl: AGGREGATED_CACHE_TTL,
        dataType: 'unified',
        priority: 'high'
      });
      console.log(`[ADSENSE_REVENUE] Data quality passed - Saved aggregated result to cache (TTL: ${AGGREGATED_CACHE_TTL}s)`);
    } catch (err) {
      console.warn('[ADSENSE_REVENUE] Failed to save aggregated cache:', err);
    }

    // Disable HTTP caching (Redis cache is used above)
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Cache-Status': 'fresh'
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
