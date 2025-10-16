/**
 * Test Redis Token Permissions
 * This will tell us exactly what your Upstash token can and cannot do
 */

const { Redis } = require('@upstash/redis');

async function testRedisPermissions() {
  console.log('🔍 Testing Upstash Redis Token Permissions...\n');

  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  const tests = [
    { name: 'PING', fn: () => redis.ping() },
    { name: 'GET (read)', fn: () => redis.get('test-key') },
    { name: 'SET (write)', fn: () => redis.set('test-key', 'test-value') },
    { name: 'SETEX (write with TTL)', fn: () => redis.setex('test-key-ttl', 10, 'test-value') },
    { name: 'INCR (increment)', fn: () => redis.incr('test-counter') },
    { name: 'EXPIRE (set expiry)', fn: () => redis.expire('test-key', 10) },
    { name: 'DEL (delete)', fn: () => redis.del('test-key') },
  ];

  console.log('Token:', process.env.UPSTASH_REDIS_REST_TOKEN?.substring(0, 20) + '...\n');

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name} - WORKS`);
    } catch (error) {
      const errorMsg = error.message || String(error);
      if (errorMsg.includes('NOPERM') || errorMsg.includes('no permissions')) {
        console.log(`❌ ${test.name} - PERMISSION DENIED`);
      } else {
        console.log(`⚠️  ${test.name} - ERROR: ${errorMsg}`);
      }
    }
  }

  console.log('\n📊 Summary:');
  console.log('If you see "PERMISSION DENIED" for write commands (SET, INCR, EXPIRE),');
  console.log('your token is READ-ONLY and you need to get the full access token from Upstash.');
}

testRedisPermissions().catch(console.error);
