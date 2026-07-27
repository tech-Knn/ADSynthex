import { NextResponse } from 'next/server';
import { bulletproofAPI } from '../../../lib/bulletproof-google-ads-api';
import { redisCacheManager } from '../../../lib/redis-cache-manager';
import { redisClient } from '../../../lib/redis-client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId') || '8613393445'; // CarHp New 07 by default
  const startDate = searchParams.get('start') || '2026-03-01';
  const endDate = searchParams.get('end') || '2026-03-26';
  const feedType = (searchParams.get('feedType') || 'carhp') as any;
  const clear = searchParams.get('clear') === 'true';

  if (clear) {
      // Clear cache for this account
      const cacheKey = redisCacheManager.generateKey({
        dataType: 'google-ads',
        accountId,
        startDate,
        endDate,
        extra: feedType
      });
      await redisClient.del(`cache:${cacheKey}`);

      const cacheKey2 = redisCacheManager.generateKey({
        dataType: 'unified',
        accountId,
        startDate,
        endDate
      });
      await redisClient.del(`cache:${cacheKey2}`);

      return NextResponse.json({ success: true, message: `Cleared cache for ${accountId}` });
  }

  try {
    const result = await bulletproofAPI.getData(startDate, endDate, accountId, {
      feedType,
      allowStale: false
    });
    
    return NextResponse.json({
        success: true,
        accountId,
        dataLength: result.data?.campaigns?.length || 0,
        result
    });
  } catch (error: any) {
    return NextResponse.json({
        success: false,
        error: error.message
    });
  }
}
