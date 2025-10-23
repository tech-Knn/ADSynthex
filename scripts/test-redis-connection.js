/**
 * Test Upstash Redis Connection
 * Verifies your Redis credentials and permissions
 */

const { Redis } = require('@upstash/redis');

async function testConnection() {
  console.log('🔍 Testing Upstash Redis Connection...\n');

  const redis = new Redis({
    url: 'https://moving-werewolf-14611.upstash.io',
    token: 'ATkTAAIncDIxOWZjZjg4YjVkNDI0NmI5Yjg2YzQyZTY1Y2RhNzEzYXAyMTQ2MTE'
  });

  try {
    // Test 1: Ping
    console.log('Test 1: Ping...');
    await redis.ping();
    console.log('✅ Ping: SUCCESS\n');

    // Test 2: Set/Get
    console.log('Test 2: Set/Get...');
    await redis.set('test:connection', 'hello-world', { ex: 60 });
    const value = await redis.get('test:connection');
    console.log(`✅ Set/Get: SUCCESS (value: ${value})\n`);

    // Test 3: Increment (required for rate limiting)
    console.log('Test 3: Increment (rate limiting)...');
    await redis.set('test:counter', '0');
    const newValue = await redis.incr('test:counter');
    console.log(`✅ Increment: SUCCESS (value: ${newValue})\n`);

    // Test 4: Expire
    console.log('Test 4: Expire...');
    await redis.expire('test:counter', 60);
    const ttl = await redis.ttl('test:counter');
    console.log(`✅ Expire: SUCCESS (TTL: ${ttl}s)\n`);

    // Test 5: Delete
    console.log('Test 5: Delete...');
    await redis.del('test:connection', 'test:counter');
    console.log('✅ Delete: SUCCESS\n');

    // Test 6: Pipeline (multi commands)
    console.log('Test 6: Pipeline...');
    const pipeline = redis.pipeline();
    pipeline.set('test:pipe1', 'value1');
    pipeline.set('test:pipe2', 'value2');
    pipeline.get('test:pipe1');
    await pipeline.exec();
    await redis.del('test:pipe1', 'test:pipe2');
    console.log('✅ Pipeline: SUCCESS\n');

    console.log('🎉 ALL TESTS PASSED!');
    console.log('\n📊 Your Upstash Redis is fully configured and ready to use!');
    console.log('   - Read/Write permissions: ✅');
    console.log('   - Rate limiting support: ✅');
    console.log('   - Cache operations: ✅');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);

    if (error.message.includes('NOPERM') || error.message.includes('no permissions')) {
      console.error('\n⚠️  PERMISSION ERROR:');
      console.error('   Your Upstash token appears to be read-only.');
      console.error('   This usually happens with the FREE tier.');
      console.error('\n💡 SOLUTION:');
      console.error('   Upgrade to Pro plan ($20/month) for write permissions');
      console.error('   OR disable rate limiter: REDIS_RATE_LIMITER_ENABLED=false');
    } else {
      console.error('\n💡 Check your credentials in .env.local:');
      console.error('   UPSTASH_REDIS_REST_URL');
      console.error('   UPSTASH_REDIS_REST_TOKEN');
    }
  }
}

testConnection();
