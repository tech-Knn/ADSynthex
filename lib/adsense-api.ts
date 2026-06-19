import { E } from '@upstash/redis/zmscore-DWj9Vh1g';
import { OAuth2Client } from 'google-auth-library';
import { getMCCForAccount, getDefaultMCC } from './mcc-config';
import { redisClient } from './redis-client';

export type AdSenseAccountType = 'afs' | 'carhp' | 'thefactrelay' | 'androidadvice';

function getOAuthClient(customerId?: string, adsenseAccountType?: AdSenseAccountType): OAuth2Client {
  // CARHP: use dedicated CARHP AdSense OAuth credentials
  if (adsenseAccountType === 'carhp') {
    const client = new OAuth2Client({
      clientId: process.env.CARHP_ADSENSE_CLIENT_ID,
      clientSecret: process.env.CARHP_ADSENSE_CLIENT_SECRET,
    });
    const refreshToken = process.env.CARHP_ADSENSE_REFRESH_TOKEN;
    if (refreshToken) client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  // ANDROIDADVICE: dedicated AndroidAdvice AdSense OAuth credentials
  if (adsenseAccountType === 'androidadvice') {
    const client = new OAuth2Client({
      clientId: process.env.ANDROIDADVICE_ADSENSE_CLIENT_ID,
      clientSecret: process.env.ANDROIDADVICE_ADSENSE_CLIENT_SECRET,
    });
    const refreshToken = process.env.ANDROIDADVICE_ADSENSE_REFRESH_TOKEN;
    if (refreshToken) client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  // AFS: use dedicated AdSense credentials if available (ADSENSE_CLIENT_ID/SECRET),
  // falling back to Google Ads credentials (which may fail if token was generated differently)
  const clientId = process.env.ADSENSE_CLIENT_ID || (customerId
    ? (getMCCForAccount(customerId) || getDefaultMCC()).googleAds.clientId
    : getDefaultMCC().googleAds.clientId);

  const clientSecret = process.env.ADSENSE_CLIENT_SECRET || (customerId
    ? (getMCCForAccount(customerId) || getDefaultMCC()).googleAds.clientSecret
    : getDefaultMCC().googleAds.clientSecret);

  const mccCreds = customerId ? (getMCCForAccount(customerId) || getDefaultMCC()) : getDefaultMCC();
  const refreshToken = mccCreds.adSense?.refreshToken || mccCreds.googleAds.refreshToken;

  const client = new OAuth2Client({ clientId, clientSecret });
  if (refreshToken) client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export interface AdSenseRevenue {
  date: string;
  style_id: string;
  channel_id?: string;
  country_name?: string;
  domain_name?: string;
  earnings: number;
  impressions: number;
  clicks: number;
}

// Transient OAuth errors we want to retry past gaxios's built-in attempts.
// Premature stream closes from https://oauth2.googleapis.com/token surface as
// ERR_STREAM_PREMATURE_CLOSE and Google's library only retries them 2× before
// bubbling up — which manifests as the "AdSense API failed" error on the dashboard.
function isTransientNetworkError(err: any): boolean {
  const code: string | undefined = err?.code || err?.error?.code;
  if (code === 'ERR_STREAM_PREMATURE_CLOSE') return true;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('premature close') || msg.includes('socket hang up') || msg.includes('network');
}

// In-memory token cache (per server process). Backed by Redis so multiple
// server instances share the same token and we don't hit OAuth N× per request.
// Google access tokens are valid for ~60 min; we cache for 50 to keep a buffer.
const TOKEN_CACHE_TTL_SECONDS = 50 * 60;
const memoryTokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

function getTokenCacheKey(customerId?: string, adsenseAccountType?: AdSenseAccountType): string {
  // Each feed has its own OAuth credentials, so they need separate cache entries.
  // For AFS / default (no adsenseAccountType passed), key by customer.
  if (adsenseAccountType) {
    return `adsense_token:${adsenseAccountType}`;
  }
  return `adsense_token:default:${customerId || 'unknown'}`;
}

async function readTokenFromCache(key: string): Promise<string | null> {
  // Memory first (fastest, no Redis round-trip)
  const mem = memoryTokenCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.token;
  if (mem) memoryTokenCache.delete(key);

  if (!redisClient.isRedisConnected()) return null;
  try {
    const cached = await redisClient.get(key);
    if (!cached) return null;
    const ttl = await redisClient.ttl(key);
    if (ttl > 0) {
      memoryTokenCache.set(key, { token: cached, expiresAt: Date.now() + ttl * 1000 });
    }
    return cached;
  } catch {
    return null;
  }
}

async function writeTokenToCache(key: string, token: string): Promise<void> {
  memoryTokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_SECONDS * 1000 });
  if (!redisClient.isRedisConnected()) return;
  try {
    await redisClient.setex(key, TOKEN_CACHE_TTL_SECONDS, token);
  } catch (err) {
    console.warn('[ADSENSE_API] Failed to write token to Redis cache:', err);
  }
}

async function getAccessToken(customerId?: string, adsenseAccountType?: AdSenseAccountType): Promise<string> {
  const cacheKey = getTokenCacheKey(customerId, adsenseAccountType);

  // Cache hit — return immediately without touching Google's OAuth endpoint.
  const cached = await readTokenFromCache(cacheKey);
  if (cached) return cached;

  // 5 attempts with exponential backoff: 1s, 2s, 4s, 8s, 16s = ~31s total wait.
  // Google's OAuth endpoint has been having sustained flakes today, so a longer
  // ride-through window dramatically improves first-fetch success rate.
  const MAX_ATTEMPTS = 5;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const client = getOAuthClient(customerId, adsenseAccountType);
      const { token } = await client.getAccessToken();
      if (!token) throw new Error('Failed to get AdSense access token');
      await writeTokenToCache(cacheKey, token);
      return token;
    } catch (err: any) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS || !isTransientNetworkError(err)) {
        throw err;
      }
      const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s, 16s
      console.warn(`[ADSENSE_API] OAuth token attempt ${attempt}/${MAX_ATTEMPTS} failed (${err?.code || err?.message?.substring(0, 80)}); retrying in ${backoffMs}ms`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  throw lastErr;
}

export async function fetchAdSenseRevenueByStyleId(
  accountId: string,
  startDate: string,
  endDate: string,
  customerId?: string,
  adsenseAccountType?: AdSenseAccountType
): Promise<AdSenseRevenue[]> {
  try {
    console.log('[ADSENSE_API] Fetching revenue - Account:', accountId);
    console.log('[ADSENSE_API] Account Type:', adsenseAccountType || 'afs (default)');
    console.log('[ADSENSE_API] Date range:', startDate, 'to', endDate);

    const token = await getAccessToken(customerId, adsenseAccountType);
    console.log('[ADSENSE_API] Got access token:', token ? 'YES' : 'NO');

    // Split dates but keep as strings to preserve leading zeros
    const startParts = startDate.split('-');
    const endParts = endDate.split('-');

    // accountId is already in format "accounts/pub-XXX", so use it directly
    const url = new URL(`https://adsense.googleapis.com/v2/${accountId}/reports:generate`);
    console.log('[ADSENSE_API] Request URL:', url.toString());
    url.searchParams.set('dateRange', 'CUSTOM');
    url.searchParams.set('startDate.year', startParts[0]);
    url.searchParams.set('startDate.month', startParts[1]);
    url.searchParams.set('startDate.day', startParts[2]);
    url.searchParams.set('endDate.year', endParts[0]);
    url.searchParams.set('endDate.month', endParts[1]);
    url.searchParams.set('endDate.day', endParts[2]);

    url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
    url.searchParams.append('metrics', 'IMPRESSIONS');
    url.searchParams.append('metrics', 'CLICKS');
    url.searchParams.append('dimensions', 'DATE');
    // AndroidAdvice now keys cost↔revenue on channel_id (which is unique per account);
    // style_id used to be the unique key but is no longer reliable for this feed. Other
    // feeds (afs/carhp/thefactrelay) still key on style_id.
    // AdSense API rejects CUSTOM_CHANNEL_ID combined with DOMAIN_NAME, so for androidadvice
    // we drop DOMAIN_NAME and synthesize 'androidadvices.com' below (this feed only ever
    // earns from that one domain — see FEED_ALLOWED_DOMAINS in app/api/adsense-cost-revenue).
    const useChannelIdKey = adsenseAccountType === 'androidadvice';
    if (useChannelIdKey) {
      url.searchParams.append('dimensions', 'CUSTOM_CHANNEL_ID');
      url.searchParams.append('dimensions', 'COUNTRY_NAME');
    } else {
      url.searchParams.append('dimensions', 'CUSTOM_SEARCH_STYLE_ID');
      url.searchParams.append('dimensions', 'COUNTRY_NAME');
      url.searchParams.append('dimensions', 'DOMAIN_NAME');
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[ADSENSE_API] Response status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('[ADSENSE_API] API Error Response:', error.substring(0, 500));
      throw new Error(`AdSense API error (${response.status}): ${error.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('[ADSENSE_API] Response data:', {
      totalRows: data.totalMatchedRows,
      rowsReceived: data.rows?.length || 0,
      headers: data.headers?.length || 0
    });

    const revenues: AdSenseRevenue[] = [];

    // Dimension order:
    //   androidadvice: DATE, CUSTOM_CHANNEL_ID, COUNTRY_NAME           (3 dims → metrics start at cells[3])
    //   other feeds:   DATE, CUSTOM_SEARCH_STYLE_ID, COUNTRY_NAME, DOMAIN_NAME (4 dims → metrics start at cells[4])
    // For androidadvice we leave domain_name undefined: AdSense API refuses to combine
    // CUSTOM_CHANNEL_ID with DOMAIN_NAME, and this publisher account also earns from
    // unrelated domains (e.g. queryvaults.com). The cost-revenue route handles the
    // domain filter for androidadvice by accepting only channels that appear in the
    // androidadvice cost URLs (channel_id is unique per domain per your config).
    const dimCount = useChannelIdKey ? 3 : 4;
    for (const row of data.rows || []) {
      const cells = row.cells;
      const date = cells[0]?.value || '';
      const idValue = cells[1]?.value || '';
      const countryName = cells[2]?.value || '';
      const domainName = useChannelIdKey ? '' : (cells[3]?.value || '');
      const earnings = parseFloat(cells[dimCount]?.value || '0');
      const impressions = parseInt(cells[dimCount + 1]?.value || '0', 10);
      const clicks = parseInt(cells[dimCount + 2]?.value || '0', 10);

      if (idValue && idValue !== '(not set)') {
        // For androidadvice, idValue is the channel_id (unique). We store it as style_id
        // so the downstream mapping pipeline (which keys on style_id) joins on channel_id
        // without needing to be aware of the dimension swap. AdSense returns the channel
        // in `partner-pub-XXX:NNN` form but Google Ads Final URLs carry only the bare
        // numeric NNN — strip the prefix so the join works.
        const normalizedId = useChannelIdKey && idValue.includes(':')
          ? idValue.split(':').pop()!
          : idValue;
        revenues.push({
          date,
          style_id: normalizedId,
          country_name: countryName === '(not set)' ? undefined : countryName,
          domain_name: domainName && domainName !== '(not set)' ? domainName : undefined,
          earnings,
          impressions,
          clicks,
        });
      }
    }

    console.log(`[ADSENSE_API] Fetched ${revenues.length} revenue records`);
    return revenues;
  } catch (error: any) {
    console.error('[ADSENSE_API] Failed:', error.message);
    throw error;
  }
}

// Returns per-domain earnings totals for a publisher. Used by androidadvice to find
// the true androidadvices.com revenue total since CUSTOM_CHANNEL_ID can't be combined
// with DOMAIN_NAME in a single report.
export async function fetchAdSenseDomainEarnings(
  accountId: string,
  startDate: string,
  endDate: string,
  customerId?: string,
  adsenseAccountType?: AdSenseAccountType
): Promise<Record<string, number>> {
  const token = await getAccessToken(customerId, adsenseAccountType);
  const startParts = startDate.split('-');
  const endParts = endDate.split('-');
  const url = new URL(`https://adsense.googleapis.com/v2/${accountId}/reports:generate`);
  url.searchParams.set('dateRange', 'CUSTOM');
  url.searchParams.set('startDate.year', startParts[0]);
  url.searchParams.set('startDate.month', startParts[1]);
  url.searchParams.set('startDate.day', startParts[2]);
  url.searchParams.set('endDate.year', endParts[0]);
  url.searchParams.set('endDate.month', endParts[1]);
  url.searchParams.set('endDate.day', endParts[2]);
  url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
  url.searchParams.append('dimensions', 'DOMAIN_NAME');

  const r = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`AdSense domain query failed (${r.status}): ${err.substring(0, 200)}`);
  }
  const data = await r.json();
  const out: Record<string, number> = {};
  for (const row of data.rows || []) {
    const domain = (row.cells[0]?.value || '').toLowerCase();
    const earnings = parseFloat(row.cells[1]?.value || '0');
    if (domain && domain !== '(not set)') out[domain] = (out[domain] || 0) + earnings;
  }
  console.log(`[ADSENSE_API] Domain earnings (${startDate}→${endDate}):`, out);
  return out;
}

export function extractStyleIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('style_id');
  } catch {
    return null;
  }
}

export function extractChannelIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('channel_id');
  } catch {
    return null;
  }
}

export function buildCompositeKey(styleId: string, channelId?: string | null): string {
  return channelId ? `${styleId}|${channelId}` : styleId;
}

export function extractDomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
} 

export async function getAdSenseAccounts(customerId?: string, adsenseAccountType?: AdSenseAccountType): Promise<any[]> {
  try {
    const token = await getAccessToken(customerId, adsenseAccountType);

    const response = await fetch('https://adsense.googleapis.com/v2/accounts', {                                                                                                                                                                                                                                                                                         
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AdSense API error: ${error}`);
    }

    const data = await response.json();
    const accounts = data.accounts || [];

    console.log(`[ADSENSE_API] Found ${accounts.length} AdSense accounts`);
    return accounts
      .map((account: any) => ({
        name: account.name,
        displayName: account.displayName || account.name.split('/').pop(),
        state: account.state,
      }));
  } catch (error: any) {
    console.error('[ADSENSE_API] Failed to fetch accounts:', error.message);
    throw error;
  }
}
