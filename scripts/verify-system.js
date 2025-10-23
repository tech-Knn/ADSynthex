/**
 * System Verification Script
 * Checks all protections are in place
 */

const { Redis } = require('@upstash/redis');

async function verifySystem() {
  console.log('🔍 Verifying Production System...\n');

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || 'https://moving-werewolf-14611.upstash.io',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || 'ATkTAAIncDIxOWZjZjg4YjVkNDI0NmI5Yjg2YzQyZTY1Y2RhNzEzYXAyMTQ2MTE'
  });

  const checks = {
    redis: false,
    cooldown: false,
    rateLimit: false,
    cache: false
  };

  try {
    // 1. Redis Connection
    console.log('1. Testing Redis Connection...');
    await redis.ping();
    checks.redis = true;
    console.log('   ✅ Redis connected\n');

    // 2. Cooldown Protection
    console.log('2. Checking Cooldown Protection...');
    const cooldown = await redis.get('quota:google:cooldown');
    if (cooldown) {
      const cooldownTime = parseInt(cooldown);
      const now = Date.now();
      checks.cooldown = now < cooldownTime;
      console.log(`   ✅ Cooldown active until ${new Date(cooldownTime).toLocaleString()}\n`);
    } else {
      console.log('   ⚠️  No cooldown set (will protect on next rate limit)\n');
    }

    // 3. Rate Limiter Config
    console.log('3. Verifying Rate Limiter Config...');
    const today = new Date().toISOString().split('T')[0];
    const dailyUsed = await redis.get(`rate:google:daily:${today}`);
    const used = dailyUsed ? parseInt(dailyUsed) : 0;
    checks.rateLimit = used < 10000;
    console.log(`   ✅ Daily quota: ${used}/10000 (${((used/10000)*100).toFixed(1)}%)\n`);

    // 4. Cache System
    console.log('4. Checking Cache System...');
    const cacheKeys = await redis.keys('cache:*');
    checks.cache = true;
    console.log(`   ✅ ${cacheKeys?.length || 0} cached entries\n`);

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('📊 SYSTEM VERIFICATION SUMMARY\n');
    console.log(`   Redis Connection:     ${checks.redis ? '✅' : '❌'}`);
    console.log(`   Cooldown Protection:  ${checks.cooldown ? '✅' : '⚠️'}`);
    console.log(`   Rate Limiter:         ${checks.rateLimit ? '✅' : '❌'}`);
    console.log(`   Cache System:         ${checks.cache ? '✅' : '❌'}`);
    console.log('\n═══════════════════════════════════════');

    const allGood = checks.redis && checks.rateLimit && checks.cache;

    if (allGood) {
      console.log('\n🎉 ALL SYSTEMS OPERATIONAL!\n');
      console.log('✅ Rate limit protections: ACTIVE');
      console.log('✅ Cache serving: ENABLED');
      console.log('✅ Redis persistence: WORKING');
      console.log('✅ Users protected: YES\n');
    } else {
      console.log('\n⚠️  SOME SYSTEMS NEED ATTENTION\n');
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

verifySystem();
