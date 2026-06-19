// Fast diagnostic: AndroidAdvice revenue ONLY (no Google Ads cost queries).
// Bypasses the slow cost-aggregation path so the team has a reliable revenue
// number while we debug per-account cost gaps.
//
// Auth: admin cookie (auth_type=admin) OR ?secret=<CRON_SECRET>.
//
// Usage:
//   GET /api/androidadvice-revenue-only                       (today, admin cookie)
//   GET /api/androidadvice-revenue-only?date=2026-06-17       (specific date)
//   GET /api/androidadvice-revenue-only?startDate=2026-06-01&endDate=2026-06-17
//   GET /api/androidadvice-revenue-only?secret=<CRON_SECRET>  (from curl)
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchAdSenseDomainEarnings } from '@/lib/adsense-api';
import { redisClient } from '@/lib/redis-client';

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h — Redis retention
const FRESH_THRESHOLD_SECONDS = 15 * 60; // 15 min — anything older is "stale"

function isAuthorized(request: NextRequest): boolean {
    const secret = new URL(request.url).searchParams.get('secret');
    if (secret && secret === process.env.CRON_SECRET) return true;
    const authType = cookies().get('auth_type')?.value;
    return authType === 'admin';
}

function todayDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) {
        return NextResponse.json({
            error: 'Server misconfiguration',
            message: 'ANDROIDADVICE_PUBLISHER_ID env var is not set',
        }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const startDate = searchParams.get('startDate') || dateParam || todayDateString();
    const endDate = searchParams.get('endDate') || dateParam || todayDateString();
    const cacheKey = `aa_revenue_only:${startDate}:${endDate}`;

    // Try fresh cache hit (< 15 min old)
    let cachedPayload: any = null;
    let cachedAgeSeconds = 0;
    try {
        const raw = await redisClient.get(cacheKey);
        if (raw) {
            cachedPayload = JSON.parse(raw);
            const ttl = await redisClient.ttl(cacheKey);
            // age = total TTL window - remaining TTL
            cachedAgeSeconds = ttl > 0 ? (CACHE_TTL_SECONDS - ttl) : CACHE_TTL_SECONDS;
            if (cachedAgeSeconds < FRESH_THRESHOLD_SECONDS) {
                return NextResponse.json({
                    ...cachedPayload,
                    _source: 'redis_cache_fresh',
                    _cacheAgeSeconds: cachedAgeSeconds,
                    _loadTimeMs: Date.now() - startTime,
                });
            }
            // Stale-but-available: hold onto it as fallback if fresh fetch fails below.
        }
    } catch {
        // Cache read failed; just fall through to fresh fetch.
    }

    try {
        const domainEarnings = await fetchAdSenseDomainEarnings(
            publisherId,
            startDate,
            endDate,
            undefined,
            'androidadvice'
        );

        const revenue = domainEarnings['androidadvices.com'] ?? 0;
        const elapsed = Date.now() - startTime;

        const payload = {
            ok: true,
            feed: 'androidadvice',
            dateRange: { startDate, endDate },
            revenue: Number(revenue.toFixed(2)),
            domain: 'androidadvices.com',
            _source: 'adsense_domain_earnings_direct',
        };

        // Cache for 24h so subsequent calls don't need to hit Google's flaky OAuth.
        try {
            await redisClient.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(payload));
        } catch (cacheErr) {
            console.warn('[AA_REVENUE_ONLY] Cache write failed (continuing):', cacheErr);
        }

        return NextResponse.json({ ...payload, _loadTimeMs: elapsed });
    } catch (err: any) {
        console.error('[AA_REVENUE_ONLY] AdSense fetch failed:', err?.message);

        // STALE FALLBACK: if we have any cached value (even >15 min old), return it
        // so the team sees data during sustained OAuth/AdSense outages.
        if (cachedPayload) {
            console.warn(`[AA_REVENUE_ONLY] Returning stale cache (age ${cachedAgeSeconds}s) due to fresh-fetch failure`);
            return NextResponse.json({
                ...cachedPayload,
                _source: 'redis_cache_stale',
                _cacheAgeSeconds: cachedAgeSeconds,
                _staleReason: err?.message?.substring(0, 200) || 'AdSense fetch failed',
                _loadTimeMs: Date.now() - startTime,
            });
        }

        return NextResponse.json({
            error: 'AdSense fetch failed',
            message: err?.message || 'Unknown error',
            _loadTimeMs: Date.now() - startTime,
        }, { status: 502 });
    }
}
