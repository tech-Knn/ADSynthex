import { redisClient } from '../lib/redis-client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function clearCaches() {
  const ids = ['2324382023', '8613393445', '8817588152', '5106471180', '1594975507', '1161525078', '9345796923'];
  
  if (!redisClient.isRedisConnected()) {
    console.log('Redis is not connected, cache is in-memory only.');
    return;
  }

  console.log('Flushing bad caches from Redis for new CarHp accounts...');
  for (const id of ids) {
    const keys = await redisClient.client?.keys(`cache:google-ads:${id}:*`);
    if (keys && keys.length > 0) {
      for (const key of keys) {
        await redisClient.del(key);
        console.log(`Deleted ${key}`);
      }
    }
  }
  console.log('Done!');
  process.exit(0);
}

clearCaches();
