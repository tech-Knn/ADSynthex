// Emergency endpoint to clear the Google Ads API rate-limiter cooldown.
//
// When Google Ads returns 429 / RESOURCE_EXHAUSTED, the redis rate limiter sets
// `quota:google:cooldown` for ~10 minutes. While set, every request is blocked
// and dashboards show $0 cost / "No campaigns found". This endpoint clears it.
//
// Usage:  POST /api/reset-cooldown?secret=<CRON_SECRET>
//         GET  /api/reset-cooldown?secret=<CRON_SECRET>  (status check only)
import { NextRequest, NextResponse } from 'next/server';
import { googleAdsRateLimiter } from '@/lib/redis-rate-limiter';
import { redisClient } from '@/lib/redis-client';

function checkSecret(request: NextRequest): NextResponse | null {
    const secret = new URL(request.url).searchParams.get('secret');
    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized - Invalid secret' }, { status: 401 });
    }
    return null;
}

async function getCooldownStatus() {
    if (!redisClient.isRedisConnected()) {
        return { redisConnected: false, active: false, secondsRemaining: 0, endsAt: null };
    }
    const cooldownUntil = await redisClient.get('quota:google:cooldown');
    if (!cooldownUntil) {
        return { redisConnected: true, active: false, secondsRemaining: 0, endsAt: null };
    }
    const endsAt = parseInt(cooldownUntil);
    const secondsRemaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    return {
        redisConnected: true,
        active: secondsRemaining > 0,
        secondsRemaining,
        endsAt: new Date(endsAt).toISOString(),
    };
}

export async function GET(request: NextRequest) {
    const unauth = checkSecret(request);
    if (unauth) return unauth;
    const status = await getCooldownStatus();
    return NextResponse.json({ ok: true, action: 'status', cooldown: status });
}

export async function POST(request: NextRequest) {
    const unauth = checkSecret(request);
    if (unauth) return unauth;

    const before = await getCooldownStatus();
    await googleAdsRateLimiter.resetCooldown();
    const after = await getCooldownStatus();

    console.log(`[RESET_COOLDOWN] Cleared. Before: ${before.secondsRemaining}s remaining, After: ${after.secondsRemaining}s`);
    return NextResponse.json({
        ok: true,
        action: 'reset',
        before,
        after,
        message: after.active
            ? 'Cooldown still active after reset — manual redis-cli del quota:google:cooldown may be needed.'
            : 'Cooldown cleared. Dashboards should load fresh data on next refresh.',
    });
}
