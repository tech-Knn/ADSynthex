// Quick: how much Google Ads cooldown is left?
// Run: `npx tsx --env-file=.env.local scripts/check-cooldown.ts`
import { redisClient } from '../lib/redis-client';

async function main() {
    if (!redisClient.isRedisConnected()) {
        console.log('Redis not connected.');
        process.exit(1);
    }

    const cooldown = await redisClient.get('quota:google:cooldown');
    if (!cooldown) {
        console.log('✅ No active cooldown. Force Refresh should work.');
        process.exit(0);
    }
    const endsAt = new Date(parseInt(cooldown));
    const secondsLeft = Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
    const minutesLeft = Math.ceil(secondsLeft / 60);
    if (secondsLeft <= 0) {
        console.log('✅ Cooldown key exists but already expired. Force Refresh should work.');
    } else {
        console.log(`❌ Cooldown active: ${minutesLeft} minute(s) (${secondsLeft}s) remaining.`);
        console.log(`   Cooldown ends at: ${endsAt.toISOString()}`);
        console.log(`   STOP hitting Force Refresh — wait until then.`);
    }
    process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
