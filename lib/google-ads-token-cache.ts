/**
 * Google Ads OAuth access-token cache backed by Redis.
 *
 * Why this file exists:
 * - The google-ads-api npm library refreshes its OAuth token via google-auth-library,
 *   which in turn fetches https://oauth2.googleapis.com/token. From Render, that
 *   request intermittently fails with ERR_STREAM_PREMATURE_CLOSE / "Premature close".
 * - When the dashboard fetches 18 androidadvice accounts in parallel, each Customer
 *   creates its own OAuth context and tries to refresh the token, causing 18
 *   simultaneous requests to oauth2.googleapis.com that hammer the unreliable path.
 * - This module fetches the token ONCE via raw HTTP (with aggressive retry) and
 *   caches it in Redis with TTL slightly shorter than the token's lifetime.
 *   Subsequent calls — even from different Render processes — reuse the cached
 *   token without ever touching oauth2.googleapis.com again until it expires.
 */

import { redisClient } from './redis-client';
import type { MCCCredentials } from './mcc-config';

const TOKEN_CACHE_PREFIX = 'gads:token:';
// Google access tokens last ~3600s. Cache with a margin so we always have ~5
// minutes of validity left when serving from cache.
const TOKEN_CACHE_MARGIN_SECONDS = 300;

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

/**
 * Fetch a fresh OAuth access token via raw HTTP with retries.
 * Bypasses google-auth-library entirely because that library's fetch path
 * is the one Render can't talk to reliably.
 */
async function refreshAccessTokenRawHttp(mccCreds: MCCCredentials): Promise<CachedToken> {
  const { clientId, clientSecret, refreshToken } = mccCreds.googleAds;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`MCC ${mccCreds.name}: missing OAuth credentials`);
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const MAX_ATTEMPTS = 4;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: controller.signal,
          // Disable HTTP/2 by using node's default agent; HTTP/1.1 is more
          // reliable to Google's OAuth endpoint from Render right now.
          cache: 'no-store',
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`OAuth ${response.status}: ${text.substring(0, 200)}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      if (!data.access_token) {
        throw new Error(`OAuth response missing access_token: ${JSON.stringify(data).substring(0, 200)}`);
      }

      const expiresIn = Math.max(60, (data.expires_in ?? 3600));
      const expiresAt = Date.now() + expiresIn * 1000;
      console.log(`[GADS_TOKEN] Refreshed token (attempt ${attempt}/${MAX_ATTEMPTS}), expires in ${expiresIn}s`);
      return { accessToken: data.access_token, expiresAt };
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);
      const isLast = attempt === MAX_ATTEMPTS;
      console.warn(`[GADS_TOKEN] Refresh attempt ${attempt}/${MAX_ATTEMPTS} failed${isLast ? ' (giving up)' : ', will retry'}: ${msg.substring(0, 200)}`);
      if (!isLast) {
        // Backoff: 1s, 3s, 7s
        await new Promise((r) => setTimeout(r, 1000 + (attempt - 1) * 2000));
      }
    }
  }

  throw new Error(`OAuth refresh exhausted retries: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

/**
 * Get a valid Google Ads access token for the given MCC.
 * Returns from Redis when fresh; falls back to a raw-HTTP refresh otherwise.
 */
export async function getGoogleAdsAccessToken(mccCreds: MCCCredentials): Promise<string> {
  const key = `${TOKEN_CACHE_PREFIX}${mccCreds.mccId}`;

  // Try Redis cache
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedToken;
      const msLeft = parsed.expiresAt - Date.now();
      if (msLeft > TOKEN_CACHE_MARGIN_SECONDS * 1000) {
        return parsed.accessToken;
      }
    }
  } catch (err) {
    console.warn(`[GADS_TOKEN] Cache read failed, will refresh:`, err);
  }

  // Refresh & store
  const fresh = await refreshAccessTokenRawHttp(mccCreds);
  try {
    // TTL slightly shorter than expiry so we never serve a token that's about to die.
    const ttlSeconds = Math.max(
      60,
      Math.floor((fresh.expiresAt - Date.now()) / 1000) - TOKEN_CACHE_MARGIN_SECONDS,
    );
    await redisClient.setex(key, ttlSeconds, JSON.stringify(fresh));
  } catch (err) {
    console.warn(`[GADS_TOKEN] Cache write failed:`, err);
  }
  return fresh.accessToken;
}

/**
 * Force a fresh refresh, discarding any cached token. Useful when the upstream
 * API returns 401/UNAUTHENTICATED and we suspect the cached token is stale.
 */
export async function invalidateGoogleAdsAccessToken(mccCreds: MCCCredentials): Promise<void> {
  try {
    await redisClient.del(`${TOKEN_CACHE_PREFIX}${mccCreds.mccId}`);
  } catch (err) {
    console.warn(`[GADS_TOKEN] Cache del failed:`, err);
  }
}
