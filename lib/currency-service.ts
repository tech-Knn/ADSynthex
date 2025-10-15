import { redisClient } from './redis-client';
import axios, { AxiosError } from 'axios';

const CONFIG = {
  REDIS_KEY: 'currency:eur-to-usd:v1',
  CACHE_TTL_SECONDS: 24 * 60 * 60,
  FALLBACK_CACHE_TTL: 60 * 60,
  ECB_API_URL: 'https://data.ecb.europa.eu/data-detail-api/EXR.D.USD.EUR.SP00.A',
  ECB_TIMEOUT_MS: 10000,
  FALLBACK_RATE: 1.09,
  MIN_RATE: 0.80,
  MAX_RATE: 1.50,
  MIN_FETCH_INTERVAL_MS: 60000,
} as const;

interface ExchangeRateCache {
  rate: number;
  fetchedAt: string;
  source: 'ecb' | 'fallback';
  expiresAt: string;
}

interface ECBApiResponse {
  dataSets?: Array<{
    series?: {
      [key: string]: {
        observations?: {
          [key: string]: [number];
        };
      };
    };
  }>;
  structure?: {
    dimensions?: {
      observation?: Array<{
        values?: Array<{ id: string; name: string }>;
      }>;
    };
  };
}

interface FetchResult {
  rate: number;
  source: 'ecb' | 'fallback';
  success: boolean;
  error?: string;
}

class CurrencyService {
  private lastFetchAttempt: number = 0;
  private inMemoryCache: ExchangeRateCache | null = null;

  async getEurToUsdRate(): Promise<number> {
    try {
      if (this.inMemoryCache && this.isCacheValid(this.inMemoryCache)) {
        console.log(`[CURRENCY] In-memory cache hit: ${this.inMemoryCache.rate} (${this.inMemoryCache.source})`);
        return this.inMemoryCache.rate;
      }

      const redisCache = await this.getFromRedisCache();
      if (redisCache) {
        this.inMemoryCache = redisCache;
        console.log(`[CURRENCY] Redis cache hit: ${redisCache.rate} (${redisCache.source})`);
        return redisCache.rate;
      }

      console.log('[CURRENCY] Cache miss, fetching from ECB...');
      const fetchResult = await this.fetchAndCacheRate();
      console.log(`[CURRENCY] Rate: ${fetchResult.rate} (${fetchResult.source})`);
      return fetchResult.rate;

    } catch (error) {
      console.error('[CURRENCY] Error:', error);
      console.log(`[CURRENCY] Using fallback: ${CONFIG.FALLBACK_RATE}`);
      return CONFIG.FALLBACK_RATE;
    }
  }

  async forceRefresh(): Promise<FetchResult> {
    try {
      console.log('[CURRENCY] Force refresh...');
      const result = await this.fetchAndCacheRate();

      if (result.success) {
        console.log(`[CURRENCY] Refresh successful: ${result.rate} (${result.source})`);
      } else {
        console.warn(`[CURRENCY] Refresh used fallback: ${result.rate}`);
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CURRENCY] Refresh failed:', errorMsg);

      await this.cacheRate(CONFIG.FALLBACK_RATE, 'fallback', CONFIG.FALLBACK_CACHE_TTL);

      return {
        rate: CONFIG.FALLBACK_RATE,
        source: 'fallback',
        success: false,
        error: errorMsg
      };
    }
  }

  async getCacheStatus(): Promise<{
    inMemory: { cached: boolean; rate?: number; source?: string };
    redis: { cached: boolean; rate?: number; source?: string; ttl?: number };
  }> {
    const inMemory = this.inMemoryCache && this.isCacheValid(this.inMemoryCache)
      ? { cached: true, rate: this.inMemoryCache.rate, source: this.inMemoryCache.source }
      : { cached: false };

    const redisCache = await this.getFromRedisCache();
    const redis = redisCache
      ? { cached: true, rate: redisCache.rate, source: redisCache.source, ttl: await this.getRedisTTL() }
      : { cached: false };

    return { inMemory, redis };
  }

  async clearCache(): Promise<void> {
    this.inMemoryCache = null;
    await redisClient.del(CONFIG.REDIS_KEY);
    console.log('[CURRENCY] Cache cleared');
  }

  private async fetchAndCacheRate(): Promise<FetchResult> {
    try {
      const rate = await this.fetchFromEcb();
      await this.cacheRate(rate, 'ecb', CONFIG.CACHE_TTL_SECONDS);
      return { rate, source: 'ecb', success: true };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CURRENCY] ECB fetch failed:', errorMsg);

      await this.cacheRate(CONFIG.FALLBACK_RATE, 'fallback', CONFIG.FALLBACK_CACHE_TTL);

      return {
        rate: CONFIG.FALLBACK_RATE,
        source: 'fallback',
        success: false,
        error: errorMsg
      };
    }
  }

  private async fetchFromEcb(): Promise<number> {
    const now = Date.now();
    const timeSinceLastFetch = now - this.lastFetchAttempt;

    if (timeSinceLastFetch < CONFIG.MIN_FETCH_INTERVAL_MS) {
      throw new Error(`Rate limit: Wait ${Math.ceil((CONFIG.MIN_FETCH_INTERVAL_MS - timeSinceLastFetch) / 1000)}s`);
    }

    this.lastFetchAttempt = now;

    try {
      const response = await axios.get<ECBApiResponse>(CONFIG.ECB_API_URL, {
        timeout: CONFIG.ECB_TIMEOUT_MS,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AdSyntheX/1.0',
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 200,
      });

      const rate = this.parseEcbResponse(response.data);

      if (!this.isValidRate(rate)) {
        throw new Error(`Invalid rate: ${rate}`);
      }

      console.log(`[CURRENCY] ECB API: 1 EUR = ${rate} USD`);
      return rate;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError;
        throw new Error(`ECB API error: ${axiosErr.response?.status || axiosErr.code}`);
      }
      throw error;
    }
  }

  private parseEcbResponse(data: ECBApiResponse): number {
    try {
      const dataSets = data?.dataSets;
      if (!dataSets || dataSets.length === 0) {
        throw new Error('No dataSets in response');
      }

      const series = dataSets[0]?.series;
      if (!series) {
        throw new Error('No series in response');
      }

      const seriesKey = Object.keys(series)[0];
      const observations = series[seriesKey]?.observations;

      if (!observations) {
        throw new Error('No observations in response');
      }

      const observationKeys = Object.keys(observations)
        .map(k => parseInt(k))
        .sort((a, b) => b - a);

      const latestKey = observationKeys[0].toString();
      const latestValue = observations[latestKey]?.[0];

      if (typeof latestValue !== 'number' || isNaN(latestValue)) {
        throw new Error(`Invalid value: ${latestValue}`);
      }

      return parseFloat(latestValue.toFixed(4));

    } catch (error) {
      throw new Error(`Parse error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  private isValidRate(rate: number): boolean {
    return (
      typeof rate === 'number' &&
      !isNaN(rate) &&
      rate >= CONFIG.MIN_RATE &&
      rate <= CONFIG.MAX_RATE
    );
  }

  private async cacheRate(rate: number, source: 'ecb' | 'fallback', ttlSeconds: number): Promise<void> {
    const cacheData: ExchangeRateCache = {
      rate,
      source,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };

    try {
      await redisClient.setex(CONFIG.REDIS_KEY, ttlSeconds, JSON.stringify(cacheData));
      this.inMemoryCache = cacheData;
      console.log(`[CURRENCY] Cached: ${rate} (${source}, TTL: ${ttlSeconds}s)`);
    } catch (error) {
      console.error('[CURRENCY] Cache error:', error);
      this.inMemoryCache = cacheData;
    }
  }

  private async getFromRedisCache(): Promise<ExchangeRateCache | null> {
    try {
      const cached = await redisClient.get(CONFIG.REDIS_KEY);
      if (!cached) return null;

      const data: ExchangeRateCache = JSON.parse(cached);

      if (!this.isValidRate(data.rate)) {
        console.warn(`[CURRENCY] Invalid cached rate: ${data.rate}`);
        await redisClient.del(CONFIG.REDIS_KEY);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[CURRENCY] Redis read error:', error);
      return null;
    }
  }

  private async getRedisTTL(): Promise<number> {
    try {
      const ttl = await redisClient.ttl(CONFIG.REDIS_KEY);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      return 0;
    }
  }

  private isCacheValid(cache: ExchangeRateCache): boolean {
    try {
      const expiresAt = new Date(cache.expiresAt).getTime();
      const now = Date.now();
      return now < expiresAt;
    } catch (error) {
      return false;
    }
  }
}

export const currencyService = new CurrencyService();

export async function getEurToUsdRate(): Promise<number> {
  return currencyService.getEurToUsdRate();
}

export const CURRENCY_CONFIG = CONFIG;
