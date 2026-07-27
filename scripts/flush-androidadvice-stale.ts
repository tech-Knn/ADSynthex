// One-shot: clear stale AndroidAdvice caches + Google Ads cooldown.
// Run: `npx tsx scripts/flush-androidadvice-stale.ts`
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { redisClient } from '../lib/redis-client';

async function main() {
    if (!redisClient.isRedisConnected()) {
        console.log('Redis not connected — nothing in Upstash to clear.');
        process.exit(0);
    }

    const patterns = [
        'androidadvice_aggregated:*',
        'cache:google-ads:*',
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
        const keys = (await redisClient.client?.keys(pattern)) || [];
        console.log(`Pattern "${pattern}": ${keys.length} key(s) matched`);
        for (const key of keys) {
            await redisClient.del(key);
            totalDeleted++;
        }
    }
    console.log(`Total cache keys deleted: ${totalDeleted}`);

    const cooldown = await redisClient.get('quota:google:cooldown');
    if (cooldown) {
        await redisClient.del('quota:google:cooldown');
        const endsAt = new Date(parseInt(cooldown));
        const secondsLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
        console.log(`Cleared cooldown that had ${secondsLeft}s remaining (was ending at ${endsAt.toISOString()})`);
    } else {
        console.log('No active cooldown to clear.');
    }

    console.log('Done. Restart dev server then Force Refresh AndroidAdvice.');
    process.exit(0);
}

main().catch(err => {
    console.error('Flush failed:', err);
    process.exit(1);
});
