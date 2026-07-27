// Clear the per-customer hourly rate-limit counters so the new (2000) limit
// takes effect immediately instead of waiting until the top of the next hour.
// Run: `npx tsx --env-file=.env.local scripts/clear-customer-rate-counters.ts`
import { redisClient } from '../lib/redis-client';

async function main() {
    if (!redisClient.isRedisConnected()) {
        console.log('Redis not connected.');
        process.exit(1);
    }
    const keys = (await redisClient.client?.keys('rate:google:customer:*')) || [];
    console.log(`Found ${keys.length} per-customer counter keys.`);
    let cleared = 0;
    for (const key of keys) {
        const val = await redisClient.get(key);
        console.log(`  ${key}: ${val}`);
        await redisClient.del(key);
        cleared++;
    }
    console.log(`Cleared ${cleared} counter keys. All accounts can fetch again immediately.`);
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
