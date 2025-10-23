/**
 * Check Google Ads API Quota Status
 * Simple script to see if you need to reset quota
 */

const { Redis } = require('@upstash/redis');

async function checkQuota() {
  console.log('[QUOTA_CHECK] Checking Google Ads quota status...\n');

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || 'https://moving-werewolf-14611.upstash.io',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || 'ATkTAAIncDIxOWZjZjg4YjVkNDI0NmI5Yjg2YzQyZTY1Y2RhNzEzYXAyMTQ2MTE'
  });

  try {
    // Get current date for daily counter
    const today = new Date().toISOString().split('T')[0];

    // Check quota status
    const [cooldownUntil, retryAfter, dailyUsed] = await Promise.all([
      redis.get('quota:google:cooldown'),
      redis.get('quota:google:retry_after'),
      redis.get(`rate:google:daily:${today}`)
    ]);

    const dailyLimit = 10000;
    const usedToday = dailyUsed ? parseInt(dailyUsed) : 0;
    const usagePercent = (usedToday / dailyLimit) * 100;

    console.log('📊 Current Quota Status:\n');
    console.log(`  Daily Usage: ${usedToday}/${dailyLimit} (${usagePercent.toFixed(1)}%)`);
    console.log(`  Remaining: ${dailyLimit - usedToday} requests\n`);

    // Check cooldown
    if (cooldownUntil) {
      const cooldownTime = parseInt(cooldownUntil);
      const now = Date.now();

      if (now < cooldownTime) {
        const remainingMs = cooldownTime - now;
        const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

        console.log('🔴 COOLDOWN ACTIVE\n');
        console.log(`  Cooldown Until: ${new Date(cooldownTime).toLocaleString()}`);
        console.log(`  Time Remaining: ${remainingHours}h ${remainingMinutes}m`);

        if (retryAfter) {
          console.log(`  Google Says Retry After: ${retryAfter}s (~${Math.round(parseInt(retryAfter) / 3600)} hours)\n`);
        }

        console.log('⚠️  RECOMMENDATION: Wait for cooldown to expire');
        console.log('   DO NOT reset now - will cause immediate rate limit errors\n');

        console.log('💡 What happens while in cooldown:');
        console.log('   ✅ Users still get data (from cache)');
        console.log('   ✅ System serves cached/stale data');
        console.log('   ✅ Background refresh paused');
        console.log('   ✅ No API calls made\n');

        console.log('🕐 Check again in a few hours or run this script periodically');
        process.exit(0);
      } else {
        // Cooldown expired but not cleared yet
        console.log('✅ COOLDOWN EXPIRED\n');
        console.log('   The cooldown period has passed.');
        console.log('   It\'s safe to reset now!\n');
        console.log('🚀 TO RESET: Run the following commands:\n');
        console.log('   1. Delete cooldown keys:');
        console.log('      (This will happen when you make your next API request)\n');
        console.log('   2. Or manually clear with Redis commands\n');
        console.log('✅ You can start using the system now!');
      }
    } else {
      console.log('✅ NO ACTIVE COOLDOWN\n');
      console.log('   System is ready to use!');
      console.log('   Safe to make API requests.\n');

      if (usagePercent > 80) {
        console.log('⚠️  WARNING: Daily quota usage above 80%');
        console.log('   Consider waiting until tomorrow or using cached data\n');
      }
    }

    // System health summary
    console.log('\n📈 System Health:');
    console.log(`  Status: ${cooldownUntil && now < parseInt(cooldownUntil) ? '🔴 In Cooldown' : '✅ Operational'}`);
    console.log(`  API Calls Today: ${usedToday}`);
    console.log(`  Quota Health: ${usagePercent < 70 ? '✅ Good' : usagePercent < 90 ? '⚠️ High' : '🔴 Critical'}`);

  } catch (error) {
    console.error('\n❌ Error checking quota:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check your .env.local file has:');
    console.error('     UPSTASH_REDIS_REST_URL');
    console.error('     UPSTASH_REDIS_REST_TOKEN');
    console.error('  2. Verify Redis connection: npm run test-redis');
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n✋ Check cancelled');
  process.exit(0);
});

checkQuota();
