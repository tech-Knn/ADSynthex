
import { redisCacheManager } from './lib/redis-cache-manager';

async function testCompression() {
    console.log('🧪 Testing Redis Compression...');

    const testKey = 'test-compression-key-' + Date.now();
    const testData = {
        id: 123,
        name: 'Test Campaign',
        metrics: Array.from({ length: 1000 }, (_, i) => ({
            date: '2023-01-01',
            clicks: i,
            impressions: i * 100
        }))
    };

    console.log('1. Setting data in cache...');
    await redisCacheManager.set(testKey, testData, { ttl: 60 });

    console.log('2. Getting data from cache...');
    const result = await redisCacheManager.get(testKey);

    if (result.data && result.data.metrics.length === 1000) {
        console.log('✅ Data retrieved successfully!');
    } else {
        console.error('❌ Data retrieval failed or mismatch!');
        console.log('Retrieved:', result.data ? 'Data present' : 'Null');
    }

    const stats = redisCacheManager.getStats();
    console.log('📊 Cache Stats:', stats);

    if (stats.compressionSavings) {
        console.log(`✅ Compression active! Savings: ${stats.compressionSavings}`);
    } else {
        console.warn('⚠️ No compression savings reported (might be too small or memory cache hit)');
    }

    process.exit(0);
}

testCompression().catch(console.error);
