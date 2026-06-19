// AndroidAdvice revenue broken down by AdSense channel_id.
// Pure AdSense — no Google Ads dependency, no cost calculation.
//
// Auth: admin cookie (auth_type=admin) OR ?secret=<CRON_SECRET>
//
// Usage:
//   GET /api/androidadvice-revenue-by-channel
//   GET /api/androidadvice-revenue-by-channel?date=2026-06-19
//   GET /api/androidadvice-revenue-by-channel?startDate=2026-06-01&endDate=2026-06-19
//   GET /api/androidadvice-revenue-by-channel?secret=<CRON_SECRET>
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchAdSenseRevenueByStyleId } from '@/lib/adsense-api';
import { redisClient } from '@/lib/redis-client';

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h Redis retention
const FRESH_THRESHOLD_SECONDS = 15 * 60; // <15 min = fresh

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

interface ChannelRow {
    channel_id: string;
    revenue: number;
    impressions: number;
    clicks: number;
    countries: { country: string; revenue: number }[];
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
    const cacheKey = `aa_revenue_by_channel:${startDate}:${endDate}`;

    // Try cache first
    let cachedPayload: any = null;
    let cachedAgeSeconds = 0;
    try {
        const raw = await redisClient.get(cacheKey);
        if (raw) {
            cachedPayload = JSON.parse(raw);
            const ttl = await redisClient.ttl(cacheKey);
            cachedAgeSeconds = ttl > 0 ? (CACHE_TTL_SECONDS - ttl) : CACHE_TTL_SECONDS;
            if (cachedAgeSeconds < FRESH_THRESHOLD_SECONDS) {
                return NextResponse.json({
                    ...cachedPayload,
                    _source: 'redis_cache_fresh',
                    _cacheAgeSeconds: cachedAgeSeconds,
                    _loadTimeMs: Date.now() - startTime,
                });
            }
        }
    } catch { /* cache read failed; continue to fresh fetch */ }

    try {
        // fetchAdSenseRevenueByStyleId returns per-row revenue with channel_id +
        // country for the androidadvice feed (uses CUSTOM_CHANNEL_ID dimension).
        const rows = await fetchAdSenseRevenueByStyleId(
            publisherId,
            startDate,
            endDate,
            undefined,
            'androidadvice'
        );

        // Aggregate by channel_id, keep per-country breakdown nested.
        const byChannel = new Map<string, ChannelRow>();
        for (const r of rows as any[]) {
            // For androidadvice, the channel_id is stored where style_id usually is.
            const channelId = r.channel_id || r.style_id || 'unknown';
            const country = r.country_name || 'unknown';
            if (!byChannel.has(channelId)) {
                byChannel.set(channelId, {
                    channel_id: channelId,
                    revenue: 0,
                    impressions: 0,
                    clicks: 0,
                    countries: [],
                });
            }
            const entry = byChannel.get(channelId)!;
            entry.revenue += r.earnings || 0;
            entry.impressions += r.impressions || 0;
            entry.clicks += r.clicks || 0;
            const existingCountry = entry.countries.find(c => c.country === country);
            if (existingCountry) existingCountry.revenue += r.earnings || 0;
            else entry.countries.push({ country, revenue: r.earnings || 0 });
        }

        const channels = Array.from(byChannel.values())
            .map(c => ({
                ...c,
                revenue: Number(c.revenue.toFixed(2)),
                countries: c.countries
                    .map(cc => ({ ...cc, revenue: Number(cc.revenue.toFixed(2)) }))
                    .sort((a, b) => b.revenue - a.revenue),
            }))
            .sort((a, b) => b.revenue - a.revenue);

        const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);

        const payload = {
            ok: true,
            feed: 'androidadvice',
            dateRange: { startDate, endDate },
            totalRevenue: Number(totalRevenue.toFixed(2)),
            channelCount: channels.length,
            channels,
            _source: 'adsense_channel_breakdown',
        };

        try {
            await redisClient.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(payload));
        } catch (cacheErr) {
            console.warn('[AA_REVENUE_BY_CHANNEL] Cache write failed (continuing):', cacheErr);
        }

        return NextResponse.json({ ...payload, _loadTimeMs: Date.now() - startTime });
    } catch (err: any) {
        console.error('[AA_REVENUE_BY_CHANNEL] AdSense fetch failed:', err?.message);

        if (cachedPayload) {
            console.warn(`[AA_REVENUE_BY_CHANNEL] Returning stale cache (age ${cachedAgeSeconds}s)`);
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
