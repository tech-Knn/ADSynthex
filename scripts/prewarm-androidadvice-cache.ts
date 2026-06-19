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
import { fetchAdSenseDomainEarnings, fetchAdSenseRevenueByStyleId, extractChannelIdFromUrl } from '../lib/adsense-api';
import { fetchGoogleAdsData } from '../lib/google-ads-api';

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const CHANNEL_WHITELIST_KEY = 'aa_channel_whitelist';

function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function prewarmRevenueOnly(startDate: string, endDate: string) {
    const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) {
        throw new Error('ANDROIDADVICE_PUBLISHER_ID env var missing');
    }
    console.log(`\n[REVENUE_ONLY] Fetching for ${startDate} → ${endDate}...`);
    const earnings = await fetchAdSenseDomainEarnings(
        publisherId, startDate, endDate, undefined, 'androidadvice'
    );
    const revenue = earnings['androidadvices.com'] ?? 0;
    const payload = {
        ok: true,
        feed: 'androidadvice',
        dateRange: { startDate, endDate },
        revenue: Number(revenue.toFixed(2)),
        domain: 'androidadvices.com',
        _source: 'adsense_domain_earnings_direct',
        _prewarmedAt: new Date().toISOString(),
    };
    const key = `aa_revenue_only:${startDate}:${endDate}`;
    await redisClient.setex(key, CACHE_TTL_SECONDS, JSON.stringify(payload));
    console.log(`[REVENUE_ONLY]   $${revenue.toFixed(2)} for ${startDate}→${endDate}`);
    console.log(`[REVENUE_ONLY]   Cached as ${key} (TTL 24h)`);
}

async function prewarmRevenueByChannel(startDate: string, endDate: string) {
    const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) throw new Error('ANDROIDADVICE_PUBLISHER_ID env var missing');
    console.log(`\n[BY_CHANNEL] Fetching for ${startDate} → ${endDate}...`);

    // Read the whitelist so we can filter to ONLY AndroidAdvice channels.
    let allowedChannelIds: Set<string> | null = null;
    try {
        const whitelistRaw = await redisClient.get(CHANNEL_WHITELIST_KEY);
        if (whitelistRaw) {
            const list = JSON.parse(whitelistRaw) as string[];
            if (Array.isArray(list) && list.length > 0) {
                allowedChannelIds = new Set(list.map(String));
                console.log(`[BY_CHANNEL]   Filtering to ${allowedChannelIds.size} AndroidAdvice channels`);
            }
        }
    } catch { /* whitelist missing; will cache unfiltered with warning */ }

    const rows: any[] = await fetchAdSenseRevenueByStyleId(
        publisherId, startDate, endDate, undefined, 'androidadvice'
    );

    const byChannel: Map<string, { channel_id: string; revenue: number; impressions: number; clicks: number; countries: { country: string; revenue: number }[] }> = new Map();
    let skippedNonAA = 0;
    for (const r of rows) {
        const channelId = r.channel_id || r.style_id || 'unknown';
        if (allowedChannelIds && !allowedChannelIds.has(String(channelId))) {
            skippedNonAA++;
            continue;
        }
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
        dateRange: { startDate, endDate },
        totalRevenue: Number(totalRevenue.toFixed(2)),
        channelCount: channels.length,
        channels,
        _filter: allowedChannelIds
            ? `filtered to ${allowedChannelIds.size} known AndroidAdvice channel_ids (${skippedNonAA} non-AA rows skipped)`
            : 'UNFILTERED — channel whitelist missing',
        _source: 'adsense_channel_breakdown',
        _prewarmedAt: new Date().toISOString(),
    };
    const key = `aa_revenue_by_channel:${startDate}:${endDate}`;
    await redisClient.setex(key, CACHE_TTL_SECONDS, JSON.stringify(payload));
    console.log(`[BY_CHANNEL]   ${channels.length} channels, total $${totalRevenue.toFixed(2)} (skipped ${skippedNonAA} non-AA)`);
    console.log(`[BY_CHANNEL]   Top 3:`);
    for (const c of channels.slice(0, 3)) {
        console.log(`               channel ${c.channel_id}: $${c.revenue.toFixed(2)}`);
    }
    console.log(`[BY_CHANNEL]   Cached as ${key} (TTL 24h)`);
}

// Build the whitelist of AdSense channel_ids that belong to androidadvices.com,
// by fetching Google Ads ads for all 18 AndroidAdvice accounts and extracting
// the channel_id query param from each ad's final_url.
async function prewarmChannelWhitelist(startDate: string, endDate: string) {
    console.log(`\n[CHANNEL_WHITELIST] Fetching Google Ads campaigns for ${startDate}→${endDate} to build channel whitelist...`);
    try {
        const data = await fetchGoogleAdsData(startDate, endDate, undefined, 'androidadvice');
        const channelIds = new Set<string>();
        for (const ad of data.ads || []) {
            const finalUrls: string[] = (ad as any).final_urls || (ad as any).ad?.final_urls || [];
            for (const url of finalUrls) {
                const ch = extractChannelIdFromUrl(url);
                if (ch) channelIds.add(ch);
            }
        }
        const list = Array.from(channelIds).sort();
        await redisClient.setex(CHANNEL_WHITELIST_KEY, CACHE_TTL_SECONDS, JSON.stringify(list));
        console.log(`[CHANNEL_WHITELIST]   Found ${list.length} unique androidadvice channel_ids`);
        console.log(`[CHANNEL_WHITELIST]   Sample: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '...' : ''}`);
        console.log(`[CHANNEL_WHITELIST]   Cached as ${CHANNEL_WHITELIST_KEY} (TTL 24h)`);
        return list;
    } catch (err: any) {
        console.error(`[CHANNEL_WHITELIST] Failed: ${err?.message}`);
        return null;
    }
}

function isValidDate(d: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function printUsage() {
    console.log('Usage:');
    console.log('  npx tsx --env-file=.env.local scripts/prewarm-androidadvice-cache.ts');
    console.log('    → prewarms today only');
    console.log('  npx tsx --env-file=.env.local scripts/prewarm-androidadvice-cache.ts 2026-06-18');
    console.log('    → prewarms a single date');
    console.log('  npx tsx --env-file=.env.local scripts/prewarm-androidadvice-cache.ts 2026-06-15 2026-06-19');
    console.log('    → prewarms a date range (single cache key for the whole range)');
    console.log('  npx tsx --env-file=.env.local scripts/prewarm-androidadvice-cache.ts last7');
    console.log('    → prewarms today + yesterday + last 7 days + month-to-date');
}

function shiftDate(base: string, daysOffset: number): string {
    const [y, m, d] = base.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + daysOffset);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function monthStart(base: string): string {
    const [y, m] = base.split('-');
    return `${y}-${m}-01`;
}

async function main() {
    const args = process.argv.slice(2);
    const todayStr = today();

    // Parse args: 0 args = today; 1 arg = single date or 'last7' shortcut; 2 args = range
    let ranges: Array<{ startDate: string; endDate: string; label: string }> = [];

    if (args.length === 0) {
        ranges.push({ startDate: todayStr, endDate: todayStr, label: 'today' });
    } else if (args.length === 1) {
        const arg = args[0];
        if (arg === 'last7' || arg === 'common') {
            // Common date ranges users tend to ask for.
            const yesterday = shiftDate(todayStr, -1);
            const sevenAgo = shiftDate(todayStr, -6);
            ranges.push({ startDate: todayStr, endDate: todayStr, label: 'today' });
            ranges.push({ startDate: yesterday, endDate: yesterday, label: 'yesterday' });
            ranges.push({ startDate: sevenAgo, endDate: todayStr, label: 'last 7 days' });
            ranges.push({ startDate: monthStart(todayStr), endDate: todayStr, label: 'month-to-date' });
        } else if (isValidDate(arg)) {
            ranges.push({ startDate: arg, endDate: arg, label: arg });
        } else {
            console.error(`Invalid argument: ${arg}`);
            printUsage();
            process.exit(1);
        }
    } else if (args.length === 2) {
        if (!isValidDate(args[0]) || !isValidDate(args[1])) {
            console.error('Both dates must be YYYY-MM-DD');
            printUsage();
            process.exit(1);
        }
        ranges.push({ startDate: args[0], endDate: args[1], label: `${args[0]} → ${args[1]}` });
    } else {
        printUsage();
        process.exit(1);
    }

    console.log(`Pre-warming ${ranges.length} range(s) for AndroidAdvice`);
    console.log(`Redis connected: ${redisClient.isRedisConnected()}`);
    if (!redisClient.isRedisConnected()) {
        console.error('Redis not connected — check UPSTASH_REDIS_REST_URL/TOKEN in .env.local');
        process.exit(1);
    }

    // The channel whitelist is date-independent at this granularity — fetching
    // Google Ads ads for today is sufficient. We rebuild it once at start.
    try { await prewarmChannelWhitelist(todayStr, todayStr); }
    catch (err: any) { console.error(`[CHANNEL_WHITELIST] Failed: ${err?.message}`); }

    for (const r of ranges) {
        console.log(`\n========== ${r.label} ==========`);
        try { await prewarmRevenueOnly(r.startDate, r.endDate); }
        catch (err: any) { console.error(`[REVENUE_ONLY] ${r.label} failed: ${err?.message}`); }
        try { await prewarmRevenueByChannel(r.startDate, r.endDate); }
        catch (err: any) { console.error(`[BY_CHANNEL] ${r.label} failed: ${err?.message}`); }
    }

    console.log('\nDone. Endpoints will serve these values from cache for 24h.');
    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
