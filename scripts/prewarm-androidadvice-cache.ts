// Pre-warm AndroidAdvice Redis cache from your LOCAL machine.
// Useful when Render's network can't reach Google OAuth but yours can.
//
// Writes to the same Upstash Redis production uses, so the live dashboard
// and the /api/androidadvice-revenue-only endpoints will serve from these
// cache entries until they age out (24h TTL).
//
// Run: `npx tsx --env-file=.env.local scripts/prewarm-androidadvice-cache.ts`
// Optional date arg: `npx tsx --env-file=.env.local scripts/prewarm-androidadvice-cache.ts 2026-06-19`
import { redisClient } from '../lib/redis-client';
import { fetchAdSenseDomainEarnings, fetchAdSenseRevenueByStyleId } from '../lib/adsense-api';

const CACHE_TTL_SECONDS = 24 * 60 * 60;

function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function prewarmRevenueOnly(date: string) {
    const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) {
        throw new Error('ANDROIDADVICE_PUBLISHER_ID env var missing');
    }
    console.log(`\n[REVENUE_ONLY] Fetching for ${date}...`);
    const earnings = await fetchAdSenseDomainEarnings(
        publisherId, date, date, undefined, 'androidadvice'
    );
    const revenue = earnings['androidadvices.com'] ?? 0;
    const payload = {
        ok: true,
        feed: 'androidadvice',
        dateRange: { startDate: date, endDate: date },
        revenue: Number(revenue.toFixed(2)),
        domain: 'androidadvices.com',
        _source: 'adsense_domain_earnings_direct',
        _prewarmedAt: new Date().toISOString(),
    };
    const key = `aa_revenue_only:${date}:${date}`;
    await redisClient.setex(key, CACHE_TTL_SECONDS, JSON.stringify(payload));
    console.log(`[REVENUE_ONLY]   ${date}: $${revenue.toFixed(2)} (androidadvices.com)`);
    console.log(`[REVENUE_ONLY]   Cached as ${key} (TTL 24h)`);
}

async function prewarmRevenueByChannel(date: string) {
    const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) throw new Error('ANDROIDADVICE_PUBLISHER_ID env var missing');
    console.log(`\n[BY_CHANNEL] Fetching for ${date}...`);
    const rows: any[] = await fetchAdSenseRevenueByStyleId(
        publisherId, date, date, undefined, 'androidadvice'
    );

    const byChannel: Map<string, { channel_id: string; revenue: number; impressions: number; clicks: number; countries: { country: string; revenue: number }[] }> = new Map();
    for (const r of rows) {
        const channelId = r.channel_id || r.style_id || 'unknown';
        const country = r.country_name || 'unknown';
        if (!byChannel.has(channelId)) {
            byChannel.set(channelId, { channel_id: channelId, revenue: 0, impressions: 0, clicks: 0, countries: [] });
        }
        const e = byChannel.get(channelId)!;
        e.revenue += r.earnings || 0;
        e.impressions += r.impressions || 0;
        e.clicks += r.clicks || 0;
        const c = e.countries.find(x => x.country === country);
        if (c) c.revenue += r.earnings || 0;
        else e.countries.push({ country, revenue: r.earnings || 0 });
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
        dateRange: { startDate: date, endDate: date },
        totalRevenue: Number(totalRevenue.toFixed(2)),
        channelCount: channels.length,
        channels,
        _source: 'adsense_channel_breakdown',
        _prewarmedAt: new Date().toISOString(),
    };
    const key = `aa_revenue_by_channel:${date}:${date}`;
    await redisClient.setex(key, CACHE_TTL_SECONDS, JSON.stringify(payload));
    console.log(`[BY_CHANNEL]   ${date}: ${channels.length} channels, total $${totalRevenue.toFixed(2)}`);
    console.log(`[BY_CHANNEL]   Top 3:`);
    for (const c of channels.slice(0, 3)) {
        console.log(`               channel ${c.channel_id}: $${c.revenue.toFixed(2)}`);
    }
    console.log(`[BY_CHANNEL]   Cached as ${key} (TTL 24h)`);
}

async function main() {
    const date = process.argv[2] || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        console.error(`Invalid date: ${date}. Use YYYY-MM-DD.`);
        process.exit(1);
    }
    console.log(`Pre-warming AndroidAdvice caches for ${date}`);
    console.log(`Redis connected: ${redisClient.isRedisConnected()}`);
    if (!redisClient.isRedisConnected()) {
        console.error('Redis not connected — check UPSTASH_REDIS_REST_URL/TOKEN in .env.local');
        process.exit(1);
    }
    try {
        await prewarmRevenueOnly(date);
    } catch (err: any) {
        console.error(`[REVENUE_ONLY] Failed: ${err?.message}`);
    }
    try {
        await prewarmRevenueByChannel(date);
    } catch (err: any) {
        console.error(`[BY_CHANNEL] Failed: ${err?.message}`);
    }
    console.log('\nDone. Production dashboard and revenue-only endpoints will now serve these values for 24h.');
    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
