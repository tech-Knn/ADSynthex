// Emergency cooldown reset.
// Run with:  npx tsx scripts/reset-google-ads-cooldown.ts
// (or)        npm run tsx scripts/reset-google-ads-cooldown.ts
//
// Clears the `quota:google:cooldown` Redis key that the rate limiter sets when
// Google Ads returns a 429 / RESOURCE_EXHAUSTED. While the key is set, every
// request is blocked for up to ~10 minutes and the dashboard shows $0 cost /
// "No campaigns found".
import { googleAdsRateLimiter } from '../lib/redis-rate-limiter';
import { redisClient } from '../lib/redis-client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    if (!redisClient.isRedisConnected()) {
        console.log('Redis not connected — cooldown is in-memory only and will clear on next restart.');
        process.exit(0);
    }

    const before = await redisClient.get('quota:google:cooldown');
    if (!before) {
        console.log('No active cooldown found. Nothing to do.');
        process.exit(0);
    }

    const endsAt = new Date(parseInt(before));
    const secondsLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
    console.log(`Active cooldown: ends at ${endsAt.toISOString()} (${secondsLeft}s remaining)`);

    await googleAdsRateLimiter.resetCooldown();

    const after = await redisClient.get('quota:google:cooldown');
    if (after) {
        console.error('Cooldown key still present after reset — manual redis-cli del may be needed.');
        process.exit(1);
    }
    console.log('Cooldown cleared. Dashboards should load fresh data on next Force Refresh.');
    process.exit(0);
}

main().catch(err => {
    console.error('Reset failed:', err);
    process.exit(1);
});
