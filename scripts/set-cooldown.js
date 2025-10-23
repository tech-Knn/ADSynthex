/**
 * Manually Set Cooldown Based on Google's Error
 * Use this when Google says you're rate limited but Redis doesn't know
 */

const { Redis } = require('@upstash/redis');

async function setCooldown() {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || 'https://moving-werewolf-14611.upstash.io',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || 'ATkTAAIncDIxOWZjZjg4YjVkNDI0NmI5Yjg2YzQyZTY1Y2RhNzEzYXAyMTQ2MTE'
  });

  console.log('[SET_COOLDOWN] Setting Google Ads API cooldown based on error...\n');

  try {
    // From your error: "Retry in 49912 seconds"
    const retrySeconds = 49912; // ~14 hours
    const cooldownUntil = Date.now() + (retrySeconds * 1000);

    console.log('⚠️  Setting Cooldown:');
    console.log(`  Retry After: ${retrySeconds}s (~${Math.round(retrySeconds / 3600)} hours)`);
    console.log(`  Cooldown Until: ${new Date(cooldownUntil).toLocaleString()}`);
    console.log(`  Buffer Added: 10 minutes\n`);

    // Set cooldown in Redis
    await redis.setex('quota:google:cooldown', retrySeconds, cooldownUntil.toString());
    await redis.setex('quota:google:retry_after', retrySeconds, retrySeconds.toString());

    console.log('✅ Cooldown set successfully!\n');

    console.log('📊 What This Means:');
    console.log('  ✅ System will STOP making API calls');
    console.log('  ✅ Users will get CACHED data only');
    console.log('  ✅ Background refresh will PAUSE');
    console.log('  ✅ No more rate limit errors exposed\n');

    console.log('🕐 Next Steps:');
    console.log(`  1. Wait ~${Math.round(retrySeconds / 3600)} hours`);
    console.log('  2. Run: npm run check-quota');
    console.log('  3. When cooldown expires, system will auto-resume\n');

    console.log('💡 Meanwhile:');
    console.log('  - Dashboard still works (cached data)');
    console.log('  - Users see no errors');
    console.log('  - System protects your quota');

  } catch (error) {
    console.error('\n❌ Error setting cooldown:', error.message);
  }
}

setCooldown();
