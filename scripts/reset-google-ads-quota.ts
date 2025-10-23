/**
 * Google Ads API Quota Reset Utility
 *
 * Use this script to reset the Google Ads API cooldown after the rate limit expires.
 * This is useful when you've hit the daily quota and need to manually clear the cooldown.
 *
 * Usage:
 *   npm run reset-quota
 *   OR
 *   npx ts-node scripts/reset-google-ads-quota.ts
 */

import { redisClient } from '../lib/redis-client';
import { googleAdsRateLimiter } from '../lib/redis-rate-limiter';

async function resetQuota() {
  console.log('[QUOTA_RESET] Starting Google Ads quota reset...\n');

  try {
    // Get current quota status
    console.log('[QUOTA_RESET] Fetching current quota status...');
    const quotaStatus = await googleAdsRateLimiter.getQuotaStatus();

    console.log('\n📊 Current Quota Status:');
    console.log(`  Daily Used: ${quotaStatus.dailyUsed}/${quotaStatus.dailyLimit} (${quotaStatus.usagePercentage.toFixed(1)}%)`);
    console.log(`  Hourly Used: ${quotaStatus.hourlyUsed}/${quotaStatus.hourlyLimit}`);
    console.log(`  In Cooldown: ${quotaStatus.isInCooldown ? '✅ YES' : '❌ NO'}`);

    if (quotaStatus.isInCooldown) {
      console.log(`  Cooldown Ends: ${quotaStatus.cooldownEnds}`);
      console.log(`  Retry After: ${quotaStatus.retryAfterSeconds}s (~${Math.round(quotaStatus.retryAfterSeconds! / 3600)} hours)`);
    }

    console.log(`  Safe to Operate: ${quotaStatus.safeToOperate ? '✅ YES' : '❌ NO'}`);
    console.log(`  Circuit State: ${quotaStatus.circuitState}`);

    // Check if cooldown is active
    if (!quotaStatus.isInCooldown) {
      console.log('\n✅ No active cooldown - nothing to reset!');
      console.log('   The API is ready to use.');
      process.exit(0);
    }

    // Calculate time remaining
    const cooldownEndsMs = new Date(quotaStatus.cooldownEnds!).getTime();
    const now = Date.now();
    const timeRemainingMs = cooldownEndsMs - now;
    const hoursRemaining = timeRemainingMs / (1000 * 60 * 60);

    console.log(`\n⏰ Time Remaining: ${hoursRemaining.toFixed(1)} hours`);

    // Warn if resetting too early
    if (timeRemainingMs > 0) {
      console.log('\n⚠️  WARNING: Cooldown period has NOT expired yet!');
      console.log(`   Resetting now may cause immediate rate limit errors.`);
      console.log(`   It's recommended to wait ${hoursRemaining.toFixed(1)} more hours.`);
      console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to proceed anyway...');

      // Wait 5 seconds before proceeding
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log('\n✅ Cooldown period has expired - safe to reset!');
    }

    // Reset the cooldown
    console.log('\n[QUOTA_RESET] Resetting cooldown...');
    await googleAdsRateLimiter.resetCooldown();

    // Verify reset
    const newStatus = await googleAdsRateLimiter.getQuotaStatus();

    console.log('\n✅ Quota Reset Complete!\n');
    console.log('📊 New Quota Status:');
    console.log(`  In Cooldown: ${newStatus.isInCooldown ? '✅ YES' : '❌ NO'}`);
    console.log(`  Safe to Operate: ${newStatus.safeToOperate ? '✅ YES' : '❌ NO'}`);
    console.log(`  Daily Used: ${newStatus.dailyUsed}/${newStatus.dailyLimit}`);

    if (newStatus.safeToOperate) {
      console.log('\n🚀 Google Ads API is now ready to use!');
      console.log('   Remember: Daily quota resets at midnight PST.');
    } else {
      console.log('\n⚠️  API still not safe to operate. Check quota usage or try again later.');
    }

    // Get Redis health status
    const redisHealth = redisClient.getHealthStatus();
    console.log(`\n💾 Redis Status: ${redisHealth.connected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Mode: ${redisHealth.mode}`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error resetting quota:', error);
    console.error('   Stack:', error instanceof Error ? error.stack : 'Unknown error');
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n❌ Reset cancelled by user');
  process.exit(0);
});

// Run the reset
resetQuota();
